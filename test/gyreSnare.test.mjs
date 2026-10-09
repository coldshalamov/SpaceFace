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
import { readRecentImpulseProvenance, clearImpulseProvenance, resolveCollisionConsequence } from '../src/combat/impulseKernel.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
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
  for (const name of ['gyre:beamOn', 'gyre:beamOff', 'gyre:snagged', 'gyre:absorbed', 'gyre:absorbTick', 'gyre:windup', 'gyre:launched', 'gyre:thrown', 'gyre:dropped', 'gyre:fuseLow', 'gyre:ballGrave', 'gyre:caught', 'audio:cue', 'toast']) {
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

// Press the verb, then keep it held while the beam is still searching: snag is
// wake-gated — the glass projects ~150 ms before a parked body may core, so a
// snaggable body lands HOLD only after ~7 ticks. Sites asserting 'beaming' have
// no snaggable candidate and are unaffected by the extra held steps.
function hold(t) {
  t.state.input.actions.gyreSnare = true; t.sim.step();
  for (let i = 0; i < 13 && t.sys._rt.phase === 'beaming'; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
}
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
  assert.equal((text.match(/TOO HEAVY/g) || []).length, 1,
    'a mixed net prints the refusal once — handlingTxt already carries it');
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
    + T.orbitLiftWu + 30;
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
    + T.orbitLiftWu + 40;
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

test('a thrown ball\'s physics:impact lands attributed damage through the consequence kernel', async () => {
  const t = await bootPhysics();
  const ball = rock(t.sim, T.mawDist, 0, 60, 8);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 2; i++) t.sim.step();
  assert.equal(ball.data.gyreLaunched, true, 'the ball is a live weapon');
  const prov = readRecentImpulseProvenance(ball, t.state.tick);
  assert.ok(prov && prov.actorId === t.player.id && prov.tag === 'gyre_launch',
    'the flight-window provenance is stamped');

  // The victim hull the bowling ball smashes — the consequence kernel resolves
  // the strike with the ball's own weapon-scaled impact and the stamped credit.
  const victim = {
    id: 9901, type: 'ship', mass: 24,
    physicsBody: { mass: 24 }, pos: { x: ball.pos.x + 10, z: ball.pos.z },
  };
  const con = resolveCollisionConsequence({
    target: victim, other: ball,
    exchangedMomentum: ball.physicsBody.mass * 120, // a committed slam
    tick: t.state.tick,
    provenance: {
      actorId: prov.actorId, weaponId: prov.weaponId,
      tag: prov.tag, appliedTick: prov.appliedTick,
    },
    pos: victim.pos, normal: { x: -1, z: 0 },
    preSolveClosingSpeed: 120,
  });
  assert.ok(con, 'the consequence resolves');
  assert.ok(con.impactDamage > 0,
    `the strike lands damage — the 8x weapon scale feeds the terrain-surface multiplier (got ${con.impactDamage})`);
  assert.equal(con.provenance.actorId, t.player.id, 'the kill credits the pilot');
  assert.equal(con.provenance.tag, 'gyre_launch', 'the family provenance survives the kernel');
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

test('a denied wake speaks once per press and re-arms on release', async () => {
  const t = await bootPhysics();
  t.player.cap = T.capActivateMin - 1;
  // The held key must not re-fire the refusal every tick — dryDenyDone latches it.
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const toasts = t.events.filter((e) => e.name === 'toast');
  const denies = t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'ui_deny');
  assert.equal(toasts.length, 1, 'exactly one warn toast across the held ticks');
  assert.equal(denies.length, 1, 'exactly one deny voice across the held ticks');
  // Release + re-press re-arms the voice — the latch is per-press, not forever.
  t.state.input.actions.gyreSnare = false; t.sim.step();
  for (let i = 0; i < 3; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.events.filter((e) => e.name === 'toast').length, 2,
    'the re-pressed key gets its own refusal');
  assert.equal(t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'ui_deny').length, 2);
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

test('sector:exit and game:newGame share the boundary drop with save:loaded', async () => {
  const t = await bootPhysics();
  for (const evt of ['sector:exit', 'game:newGame']) {
    const body = rock(t.sim, T.mawDist, 0);
    hold(t);
    for (let i = 0; i < 6; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
    assert.equal(t.sys._rt.phase, 'holding', `${evt} test holds first`);
    t.bus.emit(evt, {});
    assert.equal(t.sys._rt.phase, 'off', `${evt} drops the beam cold`);
    assert.equal(body.data.gyreCore, undefined, `${evt} unmarks the core`);
    // The held-key latch survives a boundary drop (massline parity) — release
    // and re-press to arm the next iteration's wake edge.
    t.state.input.actions.gyreSnare = false; t.sim.step();
  }
  t.cleanup();
});

test('destroy() -> init() same-state reload clears the core mark and residue', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const orphan = rock(t.sim, 900, 900);
  orphan.data.gyreCore = true; // residue the ledger never tracked
  t.sys.destroy();
  assert.equal(body.data.gyreCore, undefined, 'tracked core mark clears on destroy');
  assert.equal(orphan.data.gyreCore, undefined, 'untracked residue swept on destroy');
  t.sys.init({ state: t.state, bus: t.bus, helpers: t.helpers });
  assert.equal(t.sys._rt.phase, 'off', 'the reloaded verb starts cold');
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

test('_spendCap seeds from data.derived.cap once, then single-writes e.cap', () => {
  const t = boot(6464);
  delete t.player.cap; // a ship without the direct field: derived is the read
  t.player.data.derived = { cap: 50 };
  t.sys._spendCap(t.player, 12);
  assert.equal(t.player.cap, 38, 'seeded from derived, spent down — single-write convention');
  // Once seeded, e.cap is the channel — a derived refresh must not refund.
  t.player.data.derived.cap = 90;
  t.sys._spendCap(t.player, 8);
  assert.equal(t.player.cap, 30, 'e.cap wins after seeding — no silent derived refund');
  // A NaN derived can't poison the entity: typeof === 'number' passes NaN, so
  // the guard keys on isFinite — Math.max(0, NaN) would pin cap at NaN forever.
  delete t.player.cap;
  t.player.data.derived.cap = NaN;
  t.sys._spendCap(t.player, 5);
  assert.equal(t.player.cap, 0, 'NaN derived seeds as absent, not as a poisoned cap');
});

test('a held clump never eats a meal behind a modal screen', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 30, 6);
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const massBefore = t.sys._rt.clumpMass;
  // input.blocked is the live modal path: the sim still ticks (screenStack would
  // suspend it wholesale), so this pins BOTH halves of the contract — the pull
  // lanes keep the annulus' gravity honest while only the merge freezes.
  t.state.input.blocked = true;
  // A meal parked inside the suck annulus but OUTSIDE the merge band
  // (~13 wu for this clump) — in reach, but the screen owns the sim.
  const meal = rock(t.sim, core.pos.x + 20, core.pos.z, 6, 3);
  const distBefore = Math.hypot(meal.pos.x - core.pos.x, meal.pos.z - core.pos.z);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.clumpMass, massBefore,
    'no merge behind the modal — an eaten wreck can\'t be unseen');
  assert.notEqual(meal.alive, false, 'the meal survives the blind hold');
  const distAfter = Math.hypot(meal.pos.x - core.pos.x, meal.pos.z - core.pos.z);
  assert.ok(distAfter < distBefore,
    'the annulus keeps its gravity under a live modal — only the merge freezes');
  t.state.input.blocked = false;
  for (let i = 0; i < 30 && meal.alive !== false && t.sys._rt.clumpMass === massBefore; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.ok(t.sys._rt.clumpMass > massBefore, 'the merge resumes on the first visible tick');
  t.cleanup();
});

test('the fulfillment blackout freezes the merge the same way', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 30, 6);
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const massBefore = t.sys._rt.clumpMass;
  // The third _modalHeld leg: ui.fulfillmentBlackoutActive — the class-driven
  // delivery overlay with no stack entry and no input.blocked flag. Same
  // contract as the modal test above: pull lanes run, only the merge freezes.
  (t.state.ui = t.state.ui || {}).fulfillmentBlackoutActive = true;
  const meal = rock(t.sim, core.pos.x + 20, core.pos.z, 6, 3);
  const distBefore = Math.hypot(meal.pos.x - core.pos.x, meal.pos.z - core.pos.z);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.clumpMass, massBefore, 'no merge behind the blackout');
  assert.notEqual(meal.alive, false, 'the meal survives the blind hold');
  const distAfter = Math.hypot(meal.pos.x - core.pos.x, meal.pos.z - core.pos.z);
  assert.ok(distAfter < distBefore, 'the annulus keeps pulling under the blackout');
  t.state.ui.fulfillmentBlackoutActive = false;
  for (let i = 0; i < 30 && meal.alive !== false && t.sys._rt.clumpMass === massBefore; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.ok(t.sys._rt.clumpMass > massBefore, 'the merge resumes on the first visible tick');
  t.cleanup();
});

test('a key release behind a live modal defers the bowl to the first visible tick', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0, 30, 6);
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  // input.blocked: the sim still ticks (screenStack suspends it wholesale — a
  // screen release arrives deferred naturally), but the player can't see flight.
  // The throw is the one close they must watch: the edge stays armed, no blind bowl.
  t.state.input.blocked = true;
  t.state.input.actions.gyreSnare = false;
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'holding', 'release behind the modal defers — no blind bowl');
  assert.ok(!t.events.some((e) => e.name === 'gyre:launched'));
  assert.equal(body.data.gyreLaunched, undefined, 'the clump is still held, not thrown');
  // The screen lifts: the deferred edge fires NOW — the throw they asked for lands
  // on the first tick they can see it.
  t.state.input.blocked = false;
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'launching', 'the deferred release bowls on the first visible tick');
  assert.ok(t.events.some((e) => e.name === 'gyre:launched'), 'launch fired on the visible frame');
  t.cleanup();
});

test('a verb press wholly inside a live modal never wakes the beam — it opens on the first visible tick', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 30, 6);
  // Pad level-reads CAN produce held under input.blocked (the sim-ticking modal)
  // where keyboard can't — wave-75 caught a tap born inside the block arming a
  // beam the player never saw (stuck ON until cap_dry, since the release inside
  // the block left no falling edge to defer).
  t.state.input.blocked = true;
  t.state.input.actions.gyreSnare = true;
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off', 'a press behind the modal never commits the wake');
  t.state.input.actions.gyreSnare = false;
  t.sim.step();
  t.state.input.blocked = false;
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off', 'a tap wholly inside the modal is swallowed — no stuck beam');
  // A chord held THROUGH the lift still wakes on the first visible tick —
  // the same deferred-commit contract as the release edge.
  t.state.input.blocked = true;
  t.state.input.actions.gyreSnare = true;
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off', 'the press stays armed, not opened, under the block');
  t.state.input.blocked = false;
  t.sim.step();
  // The wake landed on the first visible tick (the parked rock may already have
  // snagged to HOLD in the same pass — the beamOn event is the honest pin).
  assert.ok(t.events.some((e) => e.name === 'gyre:beamOn'),
    'the held chord fires its wake edge on the first visible tick');
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
  assert.ok(t.events.some((e) => e.name === 'toast' && /torn free/.test(e.p.text)),
    'the loudest involuntary loss narrates like its siblings (cap_dry, adoption)');
  t.cleanup();
});

test('a held core removed externally drops the beam and clears residue', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  assert.equal(t.sys._rt.phase, 'holding');
  const heard = t.events.length;
  body.alive = false; // something else ate the core mid-hold
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'core_lost'));
  assert.equal(body.data.gyreCore, undefined, 'core_lost still sweeps the mark');
  assert.ok(t.events.slice(heard).some((e) => e.name === 'toast' && /clump destroyed/.test(e.p.text)),
    'destroyed-in-grip narrates like every other involuntary end');
  assert.ok(!t.events.slice(heard).some((e) => e.name === 'camera:shake'),
    'no second shake — the killing impact already thumped the camera');
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
  // The shadow ledger dies with the corpse — a serialized corpse re-watching
  // post-load would re-stamp credit and resurrect pull-immune otherwise.
  assert.equal(body.data.gyreLaunched, undefined, 'the mark sheds with the retire');
  assert.equal(body.data.gyreLaunchMeta, undefined, 'the serialized meta sheds too');
  t.cleanup();
});

test('a pre-disarmed ball retires without losing the restored authored scale', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  body.physicsBody = body.physicsBody || {};
  body.physicsBody.impactDamageScale = 0.2; // authored damping the launch overwrites
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.state.input.actions.gyreSnare = false; t.sim.step(); // release → bowl
  assert.equal(t.sys._rt.ballId, body.id);
  assert.ok(body.physicsBody.impactDamageScale > 1, 'launch wrote the weapon scale');
  // The evict lane's disarm: consume the stash, restore the authored scale,
  // keep the mark + serialized meta — same state an evicted-but-still-marked
  // ball carries back through a boundary re-watch.
  t.sys._disarmBall(body);
  assert.equal(body.physicsBody.impactDamageScale, 0.2, 'disarm restored the authored scale');
  assert.equal('gyrePrevImpactScale' in body.data, false, 'the stash was consumed');
  // Now a mark-stripping adopter retires it: the splice lane AND the primary
  // retire must not run a second disarm — that would DELETE the restored 0.2.
  delete body.data.gyreLaunched;
  t.sim.step();
  assert.equal(t.state.gyreSnare.launchedId, null, 'mirror retires the unmarked body');
  assert.equal(body.physicsBody.impactDamageScale, 0.2,
    'the authored scale survives — disarm is single-shot via the stash key');
  t.cleanup();
});

test('a serialized ball keeps its disarm ledger — null survives clonePlain where undefined did not', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.state.input.actions.gyreSnare = false; t.sim.step(); // release → bowl
  assert.equal(t.sys._rt.ballId, body.id);
  assert.ok(body.physicsBody.impactDamageScale > 1, 'launch wrote the weapon scale');
  assert.equal(body.data.gyrePrevImpactScale, null,
    'no authored scale — the ledger serializes as null, not a dropped undefined');
  // The real save path JSON-serializes entity.data — prove the disarm ledger
  // round-trips (an undefined-valued key would vanish here).
  const savedData = JSON.parse(JSON.stringify(body.data));
  assert.equal('gyrePrevImpactScale' in savedData, true, 'the ledger survives clonePlain');
  assert.equal(savedData.gyreLaunched, true, 'the mark round-trips too');

  // Post-load: the loaded body carries the serialized ledger + the armed scale
  // (physicsBody round-trips through makeEntity the same way).
  const t2 = await bootPhysics();
  const loaded = rock(t2.sim, T.mawDist + 30, 0);
  loaded.data = savedData;
  loaded.physicsBody = loaded.physicsBody || {};
  loaded.physicsBody.impactDamageScale = 8; // the armed weapon scale on the loaded body
  t2.bus.emit('save:loaded', {});
  t2.sim.step();
  assert.ok(t2.sys._rt.ballIds.includes(loaded.id), 'the loaded ball is re-watched');
  // A foreign adopter strips the deadline — the hand-back must still shed the
  // 8x: a ledger-less ball was a permanently-armed collider (the wave-88 hole).
  delete loaded.data.despawnAt;
  t2.sim.step();
  assert.equal(loaded.data.gyreLaunched, undefined, 'the adopted ball is unmarked');
  assert.equal(loaded.physicsBody.impactDamageScale, undefined,
    'the weapon scale sheds — authored was absent, so disarm deletes the stamp');
  assert.equal('gyrePrevImpactScale' in loaded.data, false, 'the ledger is consumed');
  t.cleanup();
  t2.cleanup();
});

test('a live primary retired unmarked still disarms and sheds the ledger', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.state.input.actions.gyreSnare = false; t.sim.step(); // release → bowl
  assert.equal(t.sys._rt.ballId, body.id);
  for (let i = 0; i < 10; i++) t.sim.step();
  assert.equal(t.state.gyreSnare.launchedId, body.id, 'mirror tracks the live ball');
  // A foreign adopter that strips ONLY the mark — it keeps the deadline, so the
  // body isn't a hand-back, but the watch still ends: unwatched ⇒ disarmed, and
  // the stash/meta/credit shadow can't ride an adopted body forever.
  assert.ok('gyrePrevDespawnAt' in body.data || 'gyrePrevTtl' in body.data
    || body.data.gyrePrevImpactScale !== undefined || body.data.gyreLaunchMeta,
    'setup: the launch shadow ledger is on the body');
  delete body.data.gyreLaunched;
  t.sim.step();
  assert.equal(t.state.gyreSnare.launchedId, null, 'mirror retires the unmarked body');
  assert.equal(body.data.gyreLaunchMeta, undefined, 'the serialized meta sheds');
  assert.equal(body.data.gyrePrevDespawnAt, undefined, 'the deadline stash sheds');
  assert.equal(body.data.gyrePrevTtl, undefined, 'the ttl stash sheds');
  assert.equal(body.data.gyrePrevImpactScale, undefined, 'the armed-scale stash sheds');
  if (body.physicsBody) {
    assert.equal(body.physicsBody.impactDamageScale, undefined,
      'the 8x weapon scale restores to authored (a bare test body has none)');
  }
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

test('the wedge courtesy lane corkscrews — a mid-cone body spirals in, not ray-drags', async () => {
  const t = await bootPhysics();
  // a=60, z=20 (inside the ~29.6 wu rim → lipT 0): dx=-114, dz=+20 off the maw.
  // A pure-radial courtesy pull would drift vel.z NEGATIVE (toward the axis);
  // the swirl share pushes it positive — the tangential lane shows in the
  // body's own motion, matching the funnel's corkscrew promise.
  const body = rock(t.sim, apexGap() + 60, 20, 6, 4, 'drone');
  assert.ok(Math.hypot(body.pos.x - T.mawDist, body.pos.z) > T.basinRadius, 'wedge lane, not the basin');
  hold(t);
  for (let i = 0; i < 15; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'beaming', 'a wedge-only body never snags');
  assert.ok(body.vel.z > 0.2, `swirl share drifts tangentially (vel.z=${body.vel.z.toFixed(2)} — pure radial gives <0)`);
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
  const sx0 = speed(shot); // pre-tug baseline (hold() runs the whole wake window)
  hold(t);
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

// -- the net-read voice: one loud catch tick, then quieter count-graded peaks --
test('the basin catch voice ticks once, count-grades new peaks, and never re-ticks a regained peak', async () => {
  const t = await bootPhysics();
  const cues = () => t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_catch');
  // Park absorbables inside the basin but past snag range (~34 wu) — the beam
  // keeps searching with bodies in the net instead of coring the first one.
  const a = rock(t.sim, T.mawDist + 45, 10, 6, 4);   // ~46 wu off the maw
  const b = rock(t.sim, T.mawDist + 55, -20, 6, 4);  // ~58 wu
  t.state.input.actions.gyreSnare = true; t.sim.step(); // press
  t.state.input.actions.gyreSnare = true; t.sim.step(); // hash-index step for the spawns
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.sys._rt.phase, 'beaming');
  assert.equal(t.state.gyreSnare.basinCount, 2);
  // (a) the first empty→net edge fires exactly one louder tick — the escalation
  // ratchet seeds from the same count, so no same-tick second emit.
  assert.equal(cues().length, 1, 'first catch fires once');
  assert.ok(Math.abs(cues()[0].p.gain - 0.3) < 1e-6, 'first catch is the louder tick');
  assert.ok(Math.abs(cues()[0].p.rate - 1.35) < 1e-6);

  // (b) a NEW shown peak ticks again, quieter and count-graded.
  rock(t.sim, T.mawDist + 50, 40, 6, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step(); // index step
  t.state.input.actions.gyreSnare = true; t.sim.step(); // counted
  assert.equal(t.state.gyreSnare.basinCount, 3);
  assert.equal(cues().length, 2, 'new shown peak re-ticks');
  assert.ok(Math.abs(cues()[1].p.gain - (0.16 + 0.03 * 3)) < 1e-6, `escalation gain grades by n=3 (got ${cues()[1] && cues()[1].p.gain})`);
  assert.ok(Math.abs(cues()[1].p.rate - (1.3 + 0.05 * 3)) < 1e-6);

  // (c) ratchet-up-only: lose one, regain to the SAME peak — stays silent.
  b.alive = false; // something ate it while it was still in the funnel
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.state.gyreSnare.basinCount, 2);
  rock(t.sim, T.mawDist + 52, 12, 6, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step(); // index
  t.state.input.actions.gyreSnare = true; t.sim.step(); // counted — back to 3, not past
  assert.equal(t.state.gyreSnare.basinCount, 3, 'regained the old peak');
  assert.equal(cues().length, 2, 'a regained peak must not re-tick');
  rock(t.sim, T.mawDist + 48, -45, 6, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step();
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.state.gyreSnare.basinCount, 4);
  assert.equal(cues().length, 3, 'past the old peak ticks again');
  assert.ok(Math.abs(cues()[2].p.gain - (0.16 + 0.03 * 4)) < 1e-6);

  // (d) the latch re-arms on basin empty: a fresh catch is the loud tick again.
  a.alive = false;
  for (const e of t.state.entities.values()) if (e !== t.player && e.type === 'asteroid' && e.alive !== false && e.data && !e.data.gyreCore) e.alive = false;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.state.gyreSnare.basinCount, 0);
  rock(t.sim, T.mawDist + 46, 15, 6, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step();
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.state.gyreSnare.basinCount, 1);
  assert.equal(cues().length, 4, 're-armed latch refires the first-catch tick');
  assert.ok(Math.abs(cues()[3].p.gain - 0.3) < 1e-6, 'the re-armed catch is loud again');

  // (e) _drop resets the whole lane — a fresh beam catches loud once more.
  // (The (d) rock is still in the net: no new spawn, so the re-catch is one tick.)
  release(t);
  t.state.input.actions.gyreSnare = true; t.sim.step();
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.ok(t.state.gyreSnare.basinCount >= 1, 'the net has material (the (d) rock is still in it)');
  assert.equal(cues().length, 5, 'post-drop catch fires the loud tick');
  assert.ok(Math.abs(cues()[4].p.gain - 0.3) < 1e-6);
  release(t);
  t.cleanup();
});

// -- the first net fill lands in the hands: one whisper edge, no ratchet buzz --
test('the first net fill emits gyre:caught once on the edge — the pad whisper pulse', async () => {
  const t = await bootPhysics();
  const caught = () => t.events.filter((e) => e.name === 'gyre:caught');
  rock(t.sim, T.mawDist + 45, 10, 6, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step();
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.state.gyreSnare.basinCount, 1);
  assert.equal(caught().length, 1, 'the empty→net edge emits exactly once');
  // A new shown peak re-ticks the AUDIO cue only — the pad edge stays single-shot
  // or a dense belt feed would buzz it on every arrival.
  rock(t.sim, T.mawDist + 50, -20, 6, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step();
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.state.gyreSnare.basinCount, 2);
  assert.equal(caught().length, 1, 'the +N ratchet stays audio-only');
  release(t);
  t.cleanup();
});

// -- the victim glow ledger survives the flip — the well collapses on the windup --
test('basinSpots ride through LAUNCH so the pull glows collapse on the windup', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist + 45, 10, 6, 4, 'drone'); // in the basin, never absorbable
  rock(t.sim, T.mawDist + 30, 0, 6, 4);          // cores on the wake-gated snag
  hold(t);
  assert.equal(t.sys._rt.phase, 'holding');
  assert.ok(t.state.gyreSnare.basinSpots.length >= 1, 'the dragged bystander glows');
  release(t);
  assert.equal(t.sys._rt.phase, 'launching');
  assert.ok(t.state.gyreSnare.basinSpots.length >= 1,
    'victim glows fade on the windup — not an instant pop at the HOLD→launching flip');
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 3; i++) t.sim.step();
  assert.equal(t.sys._rt.phase, 'off');
  assert.equal(t.state.gyreSnare.basinSpots.length, 0, '_finishLaunch owns the real clear');
  t.cleanup();
});

// -- the uneatable arrival has a quiet voice on its own edge --
test('a too-heavy body entering the net ticks once — hushed descending variant', async () => {
  const t = await bootPhysics();
  const heavies = () => t.events.filter((e) =>
    e.name === 'audio:cue' && e.p.id === 'gyre_snare_drop' && e.p.gain === 0.14);
  rock(t.sim, T.mawDist + 45, 10, T.maxClumpMass + 1, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step();
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.state.gyreSnare.tooHeavyCount, 1);
  assert.equal(heavies().length, 1, 'the 0→1 too-heavy edge speaks once');
  // A second uneatable arrival keeps the latch shut — same rhythm as the catch.
  rock(t.sim, T.mawDist + 50, -20, T.maxClumpMass + 1, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step();
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.state.gyreSnare.tooHeavyCount, 2);
  assert.equal(heavies().length, 1, 'the latch holds — no per-body ratchet');
  release(t);
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(heavies().length, 2, 'a fresh net re-arms the edge');
  release(t);
  t.cleanup();
});

// -- the re-tick positions where the lane grew --
test('the appetite re-tick speaks at the maw in BEAM and at the clump seat in HOLD', async () => {
  const t = await bootPhysics();
  const cues = () => t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_catch');
  // (a) BEAM: a fresh basin arrival past the first-catch peak re-ticks at the maw.
  rock(t.sim, T.mawDist + 45, 10, 6, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step();
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.state.gyreSnare.basinCount, 1);
  rock(t.sim, T.mawDist + 55, -20, 6, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step(); // index step
  t.state.input.actions.gyreSnare = true; t.sim.step(); // counted — new peak 2
  assert.equal(t.state.gyreSnare.basinCount, 2);
  assert.equal(cues().length, 2, 'the new shown peak re-ticked');
  const beamAt = cues()[1].p.position;
  assert.ok(Math.abs(beamAt.x - t.state.gyreSnare.maw.x) < 1e-6
    && Math.abs(beamAt.z - t.state.gyreSnare.maw.z) < 1e-6,
    'a basin arrival speaks at the maw where the mass entered the funnel');

  // (b) HOLD: clear the funnel so the next growth is unambiguously the annulus
  // lane, drop the beam to reset the peak ratchet, then snag a core and feed
  // it. dSuck > dBasin → the tick lands at the clump's LIVE seat (an always-maw
  // tick points the ear at empty space).
  release(t);
  for (const e of t.state.entities.values()) {
    if (e !== t.player && e.type === 'asteroid' && e.alive !== false && e.data && !e.data.gyreCore) e.alive = false;
  }
  rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  assert.equal(t.sys._rt.phase, 'holding');
  const clump = t.state.entities.get(t.sys._rt.coreId);
  const before = cues().length;
  // Two meals parked inside the suck annulus (outside the merge radius): the
  // annulus owns them outright — they never touch basinCount.
  rock(t.sim, clump.pos.x + 30, clump.pos.z + 10, 4, 3);
  rock(t.sim, clump.pos.x - 26, clump.pos.z + 24, 4, 3);
  t.state.input.actions.gyreSnare = true; t.sim.step(); // index step
  // Publish runs before this step's physics integration, so the seat it reads
  // is exactly this pre-step pos — an exact pin, not a tolerance.
  const seatX = clump.pos.x; const seatZ = clump.pos.z;
  t.state.input.actions.gyreSnare = true; t.sim.step(); // counted — shownN past peak
  assert.ok(cues().length > before, 'an annulus arrival re-ticks the appetite voice');
  const holdAt = cues()[cues().length - 1].p.position;
  assert.ok(Math.abs(holdAt.x - seatX) < 1e-6 && Math.abs(holdAt.z - seatZ) < 1e-6,
    `the suck lane speaks at the clump's live seat (tick ${JSON.stringify(holdAt)} vs seat ${seatX},${seatZ})`);
  // Unless the seat happened to BE the maw this tick (orbit phase), the pick
  // must not read as the maw — a basin-grown and a suck-grown tick differ.
  const seatIsMaw = Math.abs(seatX - t.state.gyreSnare.maw.x) < 1
    && Math.abs(seatZ - t.state.gyreSnare.maw.z) < 1;
  if (!seatIsMaw) {
    assert.ok(!(Math.abs(holdAt.x - t.state.gyreSnare.maw.x) < 1e-6
      && Math.abs(holdAt.z - t.state.gyreSnare.maw.z) < 1e-6),
      'and not the maw — a basin-grown tick and a suck-grown tick must not share a spot');
  }
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

// -- coverage: a TIMED held body keeps its authored lifetime across save:loaded --
test('a mid-hold save on a timed body restores its authored deadlines, not immortal debris', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  core.data.despawnAt = 500;    // authored data deadline — the snag stashes it
  core.ttl = 300;               // authored countdown — stashed beside it
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'core held before the save boundary');
  const savedData = JSON.parse(JSON.stringify(core.data));
  assert.equal(savedData.gyrePrevDespawnAt, 500, 'the stash serialized with the body');

  const t2 = await bootPhysics();
  const loaded = rock(t2.sim, T.mawDist + 30, 0, 6, 4);
  loaded.data = savedData;
  // A serialized mid-hold body carries the entity ttl on a sibling channel in the
  // real save path; model it the same way the sweep sees it post-load.
  loaded.ttl = Infinity;
  t2.bus.emit('save:loaded', {});
  t2.sim.step();
  assert.equal(loaded.alive, true, 'the restore does not kill the body');
  assert.equal(loaded.data.despawnAt, 500, 'the authored data deadline round-trips');
  assert.ok(loaded.ttl > 0 && loaded.ttl <= 300,
    `the authored countdown resumes and ticks down (got ${loaded.ttl})`);
  assert.equal(loaded.data.gyrePrevDespawnAt, undefined, 'the stash is consumed');
  assert.equal(loaded.data.gyrePrevTtl, undefined, 'the ttl stash is consumed');
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

test('a live ball that loses its mark while its deadline survives still disarms', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 40, 6);
  a.physicsBody = a.physicsBody || {};
  a.physicsBody.impactDamageScale = 0.2; // authored damping the launch overwrites
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.ballId, a.id, 'A is the flying ball');
  assert.ok(a.data.despawnAt != null, 'our stamped deadline still owns the body');
  assert.ok(a.physicsBody.impactDamageScale > 1, 'launch wrote the weapon scale');
  assert.ok(t.sys._rt.ballIds.includes(a.id), 'A is watched');
  // A foreign owner deletes the mark but keeps the deadline — the splice lane
  // must still shed the armed scale + the gyrePrev* stash, not just data keys.
  delete a.data.gyreLaunched;
  t.sim.step();
  assert.equal(a.physicsBody.impactDamageScale, 0.2, 'the authored scale is restored');
  assert.equal(a.data.gyreLaunchMeta, undefined, 'the launch ledger is gone');
  assert.equal(a.data.gyrePrevImpactScale, undefined, 'the scale stash is gone');
  assert.equal(a.data.gyrePrevDespawnAt, undefined, 'the deadline stash is gone');
  assert.ok(!t.sys._rt.ballIds.includes(a.id), 'A is spliced from the watch');
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
    // Behind the live maw: launch recoil drifts the ship (and maw) backward per
    // bowl — a fixed-lane spawn falls out of snagRadius by iteration ~7.
    const mawX = t.player.pos.x + T.mawDist;
    rock(t.sim, mawX - 30, t.player.pos.z, 40, 6);
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

test('a retired primary promotes the surviving watched ball into the primary lane', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, a.id, 'A cored');
  release(t);
  for (let i = 0; i < 10; i++) t.sim.step();
  assert.equal(t.sys._rt.ballId, a.id, 'A is the flying ball');

  // Second bowl while A flies — B becomes the primary.
  const b = rock(t.sim, T.mawDist + 2, 0, 8, 5);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, b.id, 'B cored on the re-beam');
  release(t);
  for (let i = 0; i < 10; i++) t.sim.step();
  assert.equal(t.sys._rt.ballId, b.id, 'the mirror tracks the freshest launch');
  const aMeta = a.data.gyreLaunchMeta;
  assert.ok(aMeta, 'A carries its frozen ledger');

  // B's grave lands while A still flies — A promotes back into the primary lane
  // with its ledger rehydrated from gyreLaunchMeta, not the bare pub.balls slice.
  b.data.despawnAt = t.state.simTime + 0.02;
  for (let i = 0; i < 6; i++) t.sim.step();
  assert.equal(b.alive, false, 'B retired on its own deadline');
  assert.equal(t.sys._rt.ballId, a.id,
    'the surviving watch promotes instead of the read degrading to pub.balls[]');
  assert.equal(t.sys._rt.launchedId, a.id, 'launchedId follows the promotion');
  assert.ok(t.sys._rt.ballMass > 0, 'the ledger rehydrates off the meta');
  assert.equal(t.sys._rt.ballAbsorbs, aMeta.absorbs, 'the ×N read survives the retire');
  assert.ok(t.sys._rt.ballClumpRadius > 0, 'the overlay silhouette survives');
  assert.equal(t.state.gyreSnare.launchedId, a.id, 'the mirror reads the promoted ball');
  t.cleanup();
});

test('a retired primary promotes the youngest of three live flights, not the oldest', async () => {
  const t = await bootPhysics();
  const balls = [];
  for (let n = 0; n < 3; n++) {
    const e = rock(t.sim, T.mawDist + n * 2, n * 3, 6 + n, 4);
    hold(t);
    for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
    release(t);
    for (let i = 0; i < 10; i++) t.sim.step();
    balls.push(e);
  }
  const [a, b, c] = balls;
  assert.equal(t.sys._rt.ballId, c.id, 'C is the freshest launch');
  assert.ok(t.state.gyreSnare.ballTtlLeftS > 0,
    'the renamed publish carries the seconds-left countdown (renamed from ballTtlS)');

  // C's grave lands while A+B fly — B is the youngest SURVIVOR (latest despawnAt),
  // not simply the next id in watch order.
  c.data.despawnAt = t.state.simTime + 0.02;
  for (let i = 0; i < 6; i++) t.sim.step();
  assert.equal(c.alive, false, 'C retired');
  assert.equal(t.sys._rt.ballId, b.id,
    'B promotes over A — youngest survivor by deadline, not watch position');
  assert.ok(t.sys._rt.ballMass > 0, 'the ledger rehydrated');

  b.data.despawnAt = t.state.simTime + 0.02;
  for (let i = 0; i < 6; i++) t.sim.step();
  assert.equal(b.alive, false, 'B retired');
  assert.equal(t.sys._rt.ballId, a.id, 'A is the last ball standing');
  t.cleanup();
});

test('a marked non-primary whose pos vanishes mid-flight is spliced and disarmed, not handed back', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 10; i++) t.sim.step();
  const b = rock(t.sim, T.mawDist + 2, 0, 8, 5);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 10; i++) t.sim.step();
  assert.equal(t.sys._rt.ballId, b.id, 'B is the freshest flight — A rides the watch ledger');

  // A foreign lane leaves a live, marked, deadlined body with no pos — the one
  // retire path that disarms WITHOUT hand-back semantics (no deadline strip,
  // no adoption): the splice lane's own unwatched => disarmed contract.
  // (A full step would crash on pos-less entities in coreSystem — the lane only
  // exists for pos-less bodies at lookup time, so drive the sweep directly.)
  a.pos = null;
  t.sys._sweepBallWatch(t.state);
  assert.ok(!t.sys._rt.ballIds.includes(a.id), 'the watch ledger splices it');
  assert.equal(a.data.gyrePrevImpactScale, undefined, 'the single-shot disarm consumed its ledger key');
  assert.equal(a.data.gyreLaunched, true, 'the mark survives the disarm lane — hand-back lanes own the strip');
  assert.ok(a.data.gyreLaunchMeta, 'the meta rides with the mark for a later boundary reload');
  assert.equal(t.sys._rt.ballId, b.id, 'the live primary is untouched');
  t.cleanup();
});

test('promotion on an exact deadline tie is deterministic — the latest-registered survivor wins', async () => {
  const t = await bootPhysics();
  const balls = [];
  for (let n = 0; n < 3; n++) {
    const e = rock(t.sim, T.mawDist + n * 2, n * 3, 6 + n, 4);
    hold(t);
    for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
    release(t);
    for (let i = 0; i < 10; i++) t.sim.step();
    balls.push(e);
  }
  const [a, b, c] = balls;
  // _promoteNextBall scans the watch ledger back-to-front taking score > bestScore,
  // so on an equal despawnAt the LAST-registered live ball promotes first —
  // deterministic, just not simply "oldest wins". Pin it.
  const dl = t.state.simTime + 5;
  a.data.despawnAt = dl; b.data.despawnAt = dl; c.data.despawnAt = dl;
  assert.equal(t.sys._rt.ballId, c.id, 'C was already the freshest flight');
  c.data.despawnAt = t.state.simTime + 0.02;
  for (let i = 0; i < 6; i++) t.sim.step();
  assert.equal(c.alive, false, 'C retired');
  assert.equal(t.sys._rt.ballId, b.id, 'the tie breaks to the later-registered survivor');
  b.data.despawnAt = t.state.simTime + 0.02;
  for (let i = 0; i < 6; i++) t.sim.step();
  assert.equal(t.sys._rt.ballId, a.id, 'A alone remains');
  t.cleanup();
});

test('the basin pull ramps in over the cone projection — the gravity edge moves at the glass\'s speed', async () => {
  const t = await bootPhysics();
  // Parked in the basin well past snag range — pulled, never cored.
  const prey = rock(t.sim, T.mawDist + 50, 0, 6, 4);
  t.state.input.actions.gyreSnare = true;
  t.sim.step(); // OFF -> BEAM arm tick: the pull lanes open NEXT step
  assert.equal(t.sys._rt.phase, 'beaming', 'the lash armed');
  const dvs = [];
  for (let i = 0; i < 6; i++) {
    const pvx = prey.vel.x, pvz = prey.vel.z;
    t.sim.step();
    dvs.push(Math.hypot(prey.vel.x - pvx, prey.vel.z - pvz));
  }
  assert.ok(dvs[0] > 0, 'the basin reaches the parked body on the first pull tick');
  assert.ok(dvs[0] < dvs[4] * 0.6,
    `wake ramp: the first pull (dv=${dvs[0].toFixed(4)}) is a whisper of the post-ramp pull (dv=${dvs[4].toFixed(4)})`);
  t.cleanup();
});

test('the snag itself waits for the drawn edge — a parked body cannot core inside the wake window', async () => {
  const t = await bootPhysics();
  // Dead-center on the maw: inside snagRadius from tick one — only the wake gate
  // (beamWake/0.15 >= 0.7) stands between it and coring.
  rock(t.sim, T.mawDist, 0, 6, 4);
  t.state.input.actions.gyreSnare = true;
  t.sim.step(); // arm — the pull lanes (and the beamWake counter) open next step
  assert.equal(t.sys._rt.phase, 'beaming');
  // The gate opens at ~0.105 s — the 7th pull tick. Through the window the body
  // may only be basin-dragged, never cored.
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'beaming', 'no snag inside the projection window');
  assert.equal(t.sys._rt.coreId, null, 'the parked body is prey, not core, until the edge exists');
  for (let i = 0; i < 4 && t.sys._rt.phase === 'beaming'; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.equal(t.sys._rt.phase, 'holding', 'the catch lands once the drawn edge exists');
  assert.ok(t.sys._rt.coreId != null);
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

test('a dead primary still publishes its grave while a survivor promotes same-tick', async () => {
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

  // Only the primary's deadline lands: the retire publishes ballGrave AND
  // _promoteNextBall re-seats launchedId to the survivor in the SAME publish
  // tick — the presentation's bloom gate must read (tracked id !== launchedId
  // && ballGrave), never launchedId == null, or the common two-ball grave
  // (first ball dies while the second still flies) gets no ring.
  b.data.despawnAt = t.state.simTime + 0.02;
  t.sim.step();
  t.sim.step();
  assert.equal(t.state.gyreSnare.ballGrave, true, 'the dead primary still publishes its grave');
  assert.equal(t.state.gyreSnare.launchedId, a.id,
    'the survivor inherits the primary lane on the very tick the grave publishes');
  assert.equal(t.sys._rt.ballId, a.id);
  t.cleanup();
});

test('a mid-coil yaw cannot steer the throw — the launch frame froze at release', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  const dir = { x: t.sys._rt.launchDir.x, z: t.sys._rt.launchDir.z };
  assert.equal(t.sys._rt.launchWindupTotal, T.launchWindupTicks,
    'a pebble keeps the snappy flat draw — the mass grading adds nothing');
  // Ship yaw is flight-owned, not physics-integrated (physics.js "e.rot is NOT
  // integrated here for ships") — a hard +90° mid-coil is exactly the swing a
  // live-maw read would steal the coil anchor and burst onto.
  t.player.rot += Math.PI / 2;
  t.sim.step();
  assert.equal(t.sys._rt.launchDir.x, dir.x, 'the aim stays frozen through the yaw');
  assert.equal(t.sys._rt.launchDir.z, dir.z);
  for (let i = 0; i < 12; i++) t.sim.step(); // coil + burst finish
  assert.equal(t.sys._rt.phase, 'off');
  const v = Math.hypot(core.vel.x, core.vel.z);
  const fwd = (core.vel.x * dir.x + core.vel.z * dir.z) / Math.max(1e-6, v);
  assert.ok(fwd > 0.95,
    `the burst fired along the frozen launchDir, not the yawed nose (alignment ${fwd.toFixed(3)})`);
  assert.ok(v > T.launchSpeed * 0.5, 'the throw still lands at pace');
  t.cleanup();
});

test('a survivor promoted mid-launch does NOT inherit the dead ball\'s coil or burst', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 10; i++) t.sim.step(); // A flying — its own launch resolved
  const b = rock(t.sim, T.mawDist + 2, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  assert.equal(t.sys._rt.phase, 'launching');
  assert.equal(t.sys._rt.coreId, b.id, 'the launch owns B');
  // A foreign adopter strips B's marks mid-coil: the sweep retires it as an
  // ALIVE retire (no grave), hands it back, and _promoteNextBall re-seats
  // launchedId to the survivor A. The next tick's launch lane must read the
  // launch-OWNED ball (rt.coreId === rt.launchedId), not the promoted mirror —
  // otherwise the coil/burst/recoil fire on A along B's frozen axis.
  delete b.data.gyreLaunched;
  delete b.data.despawnAt;
  const aV0 = { x: a.vel.x, z: a.vel.z };
  t.sim.step(); // the sweep retires B and promotes A inside the same publish
  assert.equal(t.sys._rt.launchedId, a.id, 'the survivor took the mirror lane');
  const thrown0 = t.events.filter((e) => e.name === 'gyre:thrown').length;
  t.sim.step();
  // The launch lane saw divergence → truncated → _finishLaunch: no burst
  // impulse landed on A along B's axis, no thrown beat crowned the hand-back.
  const aV1 = { x: a.vel.x, z: a.vel.z };
  const dv = Math.hypot(aV1.x - aV0.x, aV1.z - aV0.z);
  assert.ok(dv < 40, `A keeps flying its own launch (Δv ${dv.toFixed(1)} — no dead-axis shove)`);
  assert.equal(t.events.filter((e) => e.name === 'gyre:thrown').length, thrown0,
    'no thrown beat fires for a ball the launch no longer owns');
  assert.equal(t.sys._rt.phase, 'off', 'the interrupted launch resolved instead of riding a survivor');
  t.cleanup();
});

test('an already-adopted ball on watch overflow gets the full hand-back strip', async () => {
  const t = await bootPhysics();
  const rt = t.sys._rt;
  const stamped = t.state.simTime + 4;
  const balls = [];
  for (let i = 0; i < 8; i++) {
    const b = rock(t.sim, 400 + i * 50, 0, 6, 4);
    b.data.gyreLaunched = true;
    b.data.despawnAt = t.state.simTime + 4 + i;
    b.data.gyreLaunchMeta = {
      actorId: t.state.playerId, weaponId: 'wpn_gyre_snare', tag: 'gyre_launch',
      magnitude: 120, holdUntilSim: stamped, clumpRadius: 6,
    };
    b.data.gyrePrevImpactScale = 0.2;       // authored scale stashed at launch
    b.physicsBody.impactDamageScale = 8;    // the armed weapon payload
    rt.ballIds.push(b.id);                  // watched as if launched in order
    balls.push(b);
  }
  assert.equal(rt.ballIds.length, 8, 'the watch list starts at cap');
  // The OLDEST watch was adopted mid-flight: the mark is gone but our stamped
  // deadline + shadow ledger still ride — the evict scan picks the first
  // dead/unmarked slot, so the victim is index 0 by construction.
  const victim = balls[0];
  delete victim.data.gyreLaunched;
  victim.data.gyrePrevDespawnAt = t.state.simTime + 999; // a future authored stash
  victim.data.gyrePrevTtl = 5;
  // The ninth watch overflows the 8-cap: the adopted victim must take the
  // _handBack lane (full strip), not the still-marked disarm-only lane — a
  // disarm-only pass would leave the credit shadow + planted despawnAt on a
  // body another owner now flies.
  const fresh = rock(t.sim, 4000, 0, 6, 4);
  fresh.data.gyreLaunched = true;
  fresh.data.despawnAt = t.state.simTime + 60;
  t.sys._trackBall(fresh.id);
  assert.equal(rt.ballIds.length, 8, 'the watch list stays bounded at 8');
  assert.ok(!rt.ballIds.includes(victim.id), 'the adopted victim is evicted');
  assert.equal(victim.physicsBody.impactDamageScale, 0.2,
    'the authored impact scale came back — the adopted body is no sleeper collider');
  assert.equal(victim.data.gyrePrevImpactScale, undefined, 'the disarm ledger consumed');
  assert.equal(victim.data.gyreLaunchMeta, undefined, 'the credit shadow sheds with the hand-back');
  assert.equal(victim.data.gyrePrevTtl, undefined, 'the ttl stash consumed');
  assert.equal(victim.data.despawnAt, t.state.simTime + 999,
    'the authored deadline round-trips: our stamped flight TTL dropped, the stash restored');
  // Marked siblings keep everything — only the adopted victim was evicted.
  assert.equal(balls[1].data.gyreLaunched, true, 'a still-marked sibling keeps its mark');
  assert.equal(balls[1].physicsBody.impactDamageScale, 8,
    'and its armed payload — the evict lane never touched it');
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

test('a fuse-low warn spent in BEAM re-arms for the hold it was meant for', async () => {
  const t = await bootPhysics();
  // 60 wu shy of the maw: inside the basin pull but outside snagRadius — the beam
  // spends real search ticks dragging it in instead of snagging on the same tick.
  rock(t.sim, T.mawDist - 45, 0, 30, 6);
  // Opens the beam (>= capActivateMin 10) with ~2.7 s of burn — already under the
  // warn floor, so the warn fires during the SEARCH, not the hold it's for.
  t.player.cap = 18;
  hold(t);
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'beaming');
  const warnInBeam = t.events.filter((e) => e.name === 'gyre:fuseLow').length;
  assert.ok(warnInBeam > 0, 'the warn covers both phases — it fired while searching');
  for (let i = 0; i < 120 && t.sys._rt.phase !== 'holding'; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.equal(t.sys._rt.phase, 'holding');
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.ok(t.events.filter((e) => e.name === 'gyre:fuseLow').length > warnInBeam,
    'the warn re-fires for the hold — the latch is per hold, not per beam');
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

test('the thrown clump cannot hurt the hull that threw it', async () => {
  const t = await bootPhysics();
  const ball = rock(t.sim, T.mawDist, 0, 60, 8);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 2; i++) t.sim.step();
  assert.equal(ball.data.gyreLaunched, true, 'the ball is a live weapon');
  assert.ok(ball.physicsBody.impactDamageScale > 1, 'the weapon scale is armed');

  // The consequence router refuses playerId targets outright (the kernel's own
  // comment: "The player never consumes this path") — a slammed-back clump can
  // carry a weapon-scaled packet and stamped pilot provenance and still route
  // zero hull damage home.
  const consequences = Object.create(collisionConsequences);
  const routed = [];
  consequences.init({
    state: t.state, bus: t.bus, helpers: t.helpers,
    registry: {
      get: (id) => (id === 'combat'
        ? { kernel: { routeDamage: (p) => (routed.push(p), { ok: true }) } }
        : null),
    },
  });
  try {
    const hullBefore = t.player.hull;
    consequences._resolveTarget(
      t.player, ball, {}, ball.physicsBody.mass * 200, t.state.tick, null, false,
    );
    assert.equal(routed.length, 0, 'no damage packet routes to the pilot');
    assert.equal(t.player.hull, hullBefore, 'the hull is untouched by its own clump');
  } finally {
    consequences.destroy();
    t.cleanup();
  }
});

test('two identical runs replay an identical throw — carry, burst, and credit', async () => {
  async function run() {
    const t = await bootPhysics(7777);
    const core = rock(t.sim, T.mawDist + 20, 12, 5, 4);
    rock(t.sim, T.mawDist + 30, -6, 6, 4); // a meal for the carry
    for (let i = 0; i < 200 && t.sys._rt.members.length === 0; i++) {
      t.state.input.actions.gyreSnare = true; t.sim.step();
    }
    assert.equal(t.sys._rt.members.length, 1, 'the meal was carried');
    for (let i = 0; i < 40; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
    t.state.input.actions.gyreSnare = false; t.sim.step(); // release → launch
    for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 2; i++) t.sim.step();
    for (let i = 0; i < 30; i++) t.sim.step(); // free flight
    const prov = readRecentImpulseProvenance(core, t.state.tick);
    const snap = {
      x: core.pos.x, z: core.pos.z, vx: core.vel.x, vz: core.vel.z,
      mass: core.physicsBody.mass, phase: t.sys._rt.phase,
      launched: core.data.gyreLaunched === true,
      prov: prov && {
        actorId: prov.actorId, tag: prov.tag,
        appliedTick: prov.appliedTick, holdUntilTick: prov.holdUntilTick,
      },
    };
    t.cleanup();
    return snap;
  }
  const a = await run();
  const b = await run();
  assert.deepEqual(a, b, 'identical seed/inputs → identical throw, flight, and credit');
});

test('the absorb edge is exact: at skin+epsilon the meal merges, a hair past it gets dragged', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  assert.equal(t.sys._rt.phase, 'holding');
  const rt = t.sys._rt;
  // A fresh spawn misses the next _suckPass — the spatial hash rebuilds in the
  // physics half of the step — so a parked probe is first SEEN one step later,
  // unmoved. Park against the core's observed drift, then step twice: the
  // index step leaves it parked, the second step is its first visible check.
  let px = core.pos.x, pz = core.pos.z;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  const drx = core.pos.x - px, drz = core.pos.z - pz;
  // Slight inward bias so the sub-tick drift error can only land it INSIDE the
  // edge — still at the skin, never a nested overlap.
  const at = rock(t.sim,
    core.pos.x + drx + rt.clumpRadius + 4 + T.absorbEpsilonWu - 0.4,
    core.pos.z + drz,
    3, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step(); // hash index step
  assert.equal(at.alive, true, 'a brand-new body is invisible to the lane for one step');
  t.state.input.actions.gyreSnare = true; t.sim.step(); // first visible check
  assert.equal(at.alive, false, 'dist <= clumpRadius + er + epsilon merges');
  // A hair past it: the merge gate fails and the suck lane drags instead —
  // it survives the refusing tick (the pull only lands it a later tick).
  px = core.pos.x; pz = core.pos.z;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  const drx2 = core.pos.x - px, drz2 = core.pos.z - pz;
  const past = rock(t.sim,
    core.pos.x + drx2 + rt.clumpRadius + 4 + T.absorbEpsilonWu + 1.5,
    core.pos.z + drz2,
    3, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step(); // index step
  t.state.input.actions.gyreSnare = true; t.sim.step(); // first visible check
  assert.equal(past.alive, true, 'a hair past the epsilon edge is dragged, not eaten');
  t.cleanup();
});

test('suck-band floor: a fresh snag\'s reach stays inside the basin, mass re-widens it', () => {
  const t = boot(9401);
  const rt = t.sys._rt;
  rt.clumpRadius = 6;
  const fresh = t.sys._suckRadius(rt);
  assert.ok(fresh < T.basinRadius,
    `fresh snag reach ${fresh.toFixed(1)} wu must sit under the basin's ${T.basinRadius} wu`);
  assert.ok(Math.abs(fresh - (6 * (1 + T.suckBandMassGain) + Math.min(T.suckBandWidth, T.suckBandFloor + 6 * T.suckBandFloorRise))) < 1e-6,
    'the floor band is min(suckBandWidth, suckBandFloor + clumpRadius*rise)');
  rt.clumpRadius = 30;
  assert.ok(t.sys._suckRadius(rt) > T.basinRadius,
    'the annulus out-reaches the basin once the ball has mass — the appetite arc');
  const mid = t.sys._suckRadius(rt);
  rt.clumpRadius = 45;
  assert.ok(t.sys._suckRadius(rt) > mid && t.sys._suckRadius(rt) < T.basinRadius * 1.5,
    'the appetite ring keeps growing past mid-arc — the cap lands at maxClumpRadius');
  rt.clumpRadius = 60;
  assert.equal(t.sys._suckRadius(rt), T.basinRadius * 1.5, 'the top-end reach cap is unchanged');
});

test('suckRadius publishes live during HOLD and drains on OFF — no stale annulus', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  assert.equal(t.state.gyreSnare.phase, 'holding');
  assert.ok(t.state.gyreSnare.suckRadius > 0,
    'the annulus publishes its live radius while the hold runs');
  const heldSuckR = t.state.gyreSnare.suckRadius;
  release(t); // a hold release is the throw — ride the launch lane to OFF
  let sawLaunch = false;
  for (let i = 0; i < 20 && t.state.gyreSnare.phase !== 'off'; i++) {
    t.state.input.actions.gyreSnare = false; t.sim.step();
    if (t.state.gyreSnare.phase === 'launching') {
      sawLaunch = true;
      // The annulus keeps its drawn reach through the coil+burst — the ring dies
      // on the close fade, not a ~129→~60 wu snap back to the clump-radius
      // fallback on the same frame the collapse begins.
      assert.equal(t.state.gyreSnare.suckRadius, heldSuckR,
        'the frozen hold radius publishes through LAUNCH');
    }
  }
  assert.ok(sawLaunch, 'the loop actually rode through the launching phase');
  assert.equal(t.state.gyreSnare.phase, 'off', 'the launch resolves to OFF');
  assert.equal(t.state.gyreSnare.suckRadius, 0,
    'the OFF branch zeroes the mirror — no reader sees the last annulus radius');
  t.cleanup();
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

test('the orbit phase integrates — a mid-arc absorb never teleports the slot', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 45; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const rt = t.sys._rt;
  assert.equal(rt.phase, 'holding');
  // Seeded at the snag, then advanced by rate·dt per hold tick — the wave-91 bug:
  // the slot used seed + dir·simTime·rate, so every post-knee absorb moved it by
  // simTime·Δrate (~25 rad at t=300 s) — a spring lurch plus a holdLag spike that
  // could false-fire the strain warn on a routine meal.
  const before = rt.orbitAngle;
  rt.clumpRadius = 60; // a mid-arc absorb landing past the ponderous knee (rate 0.85 → floor)
  t.state.input.actions.gyreSnare = true; t.sim.step();
  const step = Math.abs(rt.orbitAngle - before);
  const maxStep = T.orbitRate * DT * 1.5;
  assert.ok(step <= maxStep,
    `one tick advances the slot by at most rate·dt (moved ${step.toFixed(3)} rad, bound ${maxStep.toFixed(3)})`);
  assert.ok(step > 1e-4,
    `the phase keeps integrating through the derate (moved ${step.toFixed(4)})`);
  t.cleanup();
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
  const clumpR = t.sys._rt.clumpRadius; // pre-drop — _drop resets the ledger
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
    T.orbitRate * Math.max(T.orbitRadiusMin, 4 * T.orbitRadiusScale) * T.tearSnapOrbitFrac
      * Math.min(1, clumpR / T.maxClumpRadius));
  assert.equal(snapV, T.tearSnapWuS,
    `a routine clump rides the floor — the graded term is top-end only (got ${snapV.toFixed(2)})`);
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
    heavyRate * Math.max(T.orbitRadiusMin, 60 * T.orbitRadiusScale) * T.tearSnapOrbitFrac
      * Math.min(1, 60 / T.maxClumpRadius));
  assert.ok(snapHeavy > T.tearSnapWuS,
    `a capped ball earns the graded term past the floor (got ${snapHeavy.toFixed(2)})`);
  assert.ok(Math.abs(hhyp - 6 * snapHeavy) < 1e-6,
    `ponderous snap = mass × floored rate × orbitR × frac × mass-grade (got ${hhyp.toFixed(3)} vs ${(6 * snapHeavy).toFixed(3)})`);
  t3.cleanup();
});

test('the 9th live ball evicts the oldest watch — disarmed but still marked', async () => {
  const t = await bootPhysics();
  const balls = [];
  for (let n = 0; n < 9; n++) {
    // Behind the live maw on the -x side: the launch counter-impulse drifts the
    // ship (and so the maw) backward a few wu per bowl — a fixed-lane spawn falls
    // out of snagRadius by iteration ~7. maw-30 stays inside snagRadius (34) and
    // behind every launch start (orbit slots land ≥ maw-22, balls fly +x), so no
    // thrown ball's trajectory can plow the candidate before it cores.
    const mawX = t.player.pos.x + T.mawDist; // rot stays 0 in this harness
    const b = rock(t.sim, mawX - 30, t.player.pos.z, 40, 6);
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

test('a displaced primary joins balls[] under a fresh core — and never double-dresses mid-throw', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 6; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  // Feed it one meal first — the frozen ledger is only non-empty for a ball
  // that actually absorbed (a lone rock serializes an empty slice).
  const seed = t.state.entities.get(t.sys._rt.coreId);
  rock(t.sim, seed.pos.x + 20, seed.pos.z + 4, 4, 3);
  for (let i = 0; i < 14; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.ok(t.state.gyreSnare.absorbs >= 1, 'the clump ate before the throw');
  release(t);
  // Inside the coil/burst the ball still owns the core mark (rt.coreId ===
  // rt.ballId until _finishLaunch) — self-publishing there would dress the
  // same body in the primary clump group AND the secondary overlay at once.
  for (let i = 0; i < 3; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'launching', 'still inside the throw');
  assert.equal(t.sys._rt.coreId, a.id, 'the thrown ball still rides its own mark');
  assert.ok(!t.state.gyreSnare.balls.some((x) => x.id === a.id),
    'the thrown ball never double-dresses as a secondary during the coil');
  for (let i = 0; i < 12; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'off');
  assert.equal(t.sys._rt.coreId, null);
  assert.ok(!t.state.gyreSnare.balls.some((x) => x.id === a.id),
    'un-displaced, the primary keeps only its own lane');
  // Re-beam and snag a fresh core — the still-flying ball is displaced and
  // joins the secondary lane with its frozen member ledger for the overlay.
  t.player.cap = 100;
  const b = rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  assert.equal(t.sys._rt.coreId, b.id, 'a fresh core owns the clump group');
  const displaced = t.state.gyreSnare.balls.find((x) => x.id === a.id);
  assert.ok(displaced, 'the displaced primary publishes into balls[]');
  assert.ok(Array.isArray(displaced.members) && displaced.members.length > 0,
    'its frozen member ledger rides along for the overlay');
  release(t);
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
  assert.ok(t.events.some((e) => e.name === 'toast' && /clump reclaimed/.test(e.p.text)),
    'the involuntary loss narrates itself');
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
  assert.ok(t.events.some((e) => e.name === 'toast' && /clump reclaimed/.test(e.p.text)),
    'the involuntary loss narrates itself');
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
  assert.ok(t.events.some((e) => e.name === 'toast' && /clump reclaimed/.test(e.p.text)),
    'the mid-coil adoption narrates itself too — the throw silently eaten is the one the player least expects');
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
  assert.equal(kept.data.gyreLaunched, undefined,
    'the mark sheds with the watch — a deadline survivor can\'t stay pull/snag-immune');
  assert.equal(kept.data.gyreLaunchMeta, undefined, 'the credit shadow shed on retire');
  assert.equal(kept.physicsBody.impactDamageScale, 1.5, 'the authored scale restored');
  assert.equal(kept.data.gyrePrevImpactScale, undefined, 'the stash consumed');
  assert.ok(!t.sys._rt.ballIds.includes(kept.id), 'the retired ball left the watch list');
});

test('the coil grades by payload — a capped moon takes the longer bow', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, T.maxClumpMass, 4);
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  const total = t.sys._rt.launchWindupTotal;
  assert.equal(total, T.launchWindupTicks + T.launchWindupTicksMass,
    'a capped moon draws the full graded bow');
  // The tick-1 latch + crescendo denominator ride the graded total: the windup
  // beat still fires exactly once and the published ramp never leaves [0,1].
  for (let i = 0; i < total + 1 && t.sys._rt.launchWindup > 0; i++) {
    t.sim.step();
    const w = t.state.gyreSnare.launchWindup01;
    assert.ok(w >= 0 && w <= 1, `launchWindup01 stays in ramp bounds, got ${w}`);
  }
  assert.equal(t.sys._rt.launchWindup, 0, 'the graded coil fully unwinds');
  assert.ok(t.events.some((e) => e.name === 'gyre:windup'),
    'the tick-1 windup beat still fires on a graded coil');
  t.cleanup();
});

test('a closed beam forgets its count ledgers — the next beam diffs from zero', async () => {
  const t = await bootPhysics();
  // A body 55 wu behind the maw sits in the 86 wu basin pull but outside the
  // 34 wu snag — it feeds basinCount without ever becoming the core.
  rock(t.sim, T.mawDist + 55, 0, T.rockMass, 4);
  for (let i = 0; i < 4; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'beaming');
  assert.ok(t.sys._rt.prevBasinN > 0,
    `the fold ledger observed this beam's counts (prevBasinN=${t.sys._rt.prevBasinN})`);
  t.state.input.actions.gyreSnare = false;
  t.sim.step(); // released before a snag — the _drop path, not a launch finish
  assert.equal(t.sys._rt.phase, 'off');
  assert.equal(t.sys._rt.prevBasinN, 0, 'basin fold ledger reset on drop');
  assert.equal(t.sys._rt.prevSuckN, 0, 'suck fold ledger reset on drop');
  t.cleanup();
});
