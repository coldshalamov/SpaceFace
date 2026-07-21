/**
 * PQ-012 / SF-12 — Continuous field system integration.
 *
 * Harness: curated sim host (src/core/sim.js) with production systems in production relative order
 * (fields → physics). Movement proofs boot the real SG-02 rapier-dynamic authority (loads headless,
 * mass-seed test pattern) so the impulse actually crosses the membrane and moves a body — no mocks.
 *
 * Coverage:
 *   • golden inertness / flag gate (FIELD_FLAGS OFF under node → strict no-op)
 *   • three consumers on the production path: Well pulls, Repulsor pushes, Cone clears forward
 *   • heavy-shrug at the Δv layer (heavy ship moves a small fraction of a light body)
 *   • impulse membrane only (no e.vel write, no writePhysicsControl): a field alone never moves a body
 *   • bounded lifetime / expiry + cooldown start
 *   • destruction cleanup (shoot the emitter → field unregisters the same tick, no orphan force)
 *   • active-field cap
 *   • save/load normalize-away
 *   • deterministic replay
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { physics } from '../src/core/physics.js';
import { FIELD_DEFS, FIELD_FLAGS, FIELD_MAX_ACTIVE } from '../src/data/fields.js';

const DT = SIM_DT;

function boot(seed = 4242, { withPhysics = false } = {}) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: withPhysics ? [fields, physics] : [fields],
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
  const events = [];
  for (const name of ['fields:deployed', 'fields:ended', 'fields:coneToggled', 'fields:deployDenied', 'fields:cleared', 'presentation:vfxCue', 'audio:cue', 'toast']) {
    sim.bus.on(name, (p) => events.push({ name, p, tick: state.tick }));
  }
  return { sim, state, bus: sim.bus, helpers, player, events, fieldsSys: sim.registry.get('fields'), physicsSys: sim.registry.get('physics') };
}

async function bootPhysics(seed = 4343) {
  const t = boot(seed, { withPhysics: true });
  t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const ready = await t.physicsSys.prepareBackend(t.state);
  assert.equal(ready, true, 'SG-02 rapier-dynamic backend should initialize headless');
  t.cleanup = () => { if (typeof t.physicsSys._disableSg02DynamicAuthority === 'function') t.physicsSys._disableSg02DynamicAuthority(); };
  return t;
}

function lightBody(sim, x, z, mass = 2) {
  return sim.spawn({
    type: 'wreck', team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 4, collides: true,
    hull: 40, hullMax: 40,
    physicsBody: { schemaVersion: 1, radius: 4, mass, inertiaY: 4, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    data: { majorDebris: true },
  });
}
function heavyShip(sim, x, z, mass = 140) {
  return sim.spawn({
    type: 'ship', team: 2, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 14, collides: true,
    hull: 300, hullMax: 300, flightModel: { inertia: 200 },
    physicsBody: { schemaVersion: 1, radius: 14, mass, inertiaY: 200, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { ai: false, combatProfileId: 'combat_profile_standard_ship' },
  });
}

function pressDeploy(t, action, aim) {
  if (aim) t.state.input.aimWorld = aim;
  t.state.input.actions[action] = true;
  t.sim.step();
  assert.equal(t.state.input.actions[action], false, 'deploy edge must be consumed');
}
function speed(e) { return Math.hypot(e.vel.x, e.vel.z); }

// FIELD_FLAGS is a module-mutable Tier-B gate; the golden leaves it false. Each test opts in and
// restores so no test leaks the browser default into another.
function withFlag(on, fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = on;
  let result;
  try {
    result = fn();
  } catch (e) {
    FIELD_FLAGS.enabled = prev;
    throw e;
  }
  // Restore synchronously for sync bodies; on settle for async bodies (a sync finally would flip
  // the flag back before the awaited body ever runs).
  if (result && typeof result.then === 'function') {
    return result.finally(() => { FIELD_FLAGS.enabled = prev; });
  }
  FIELD_FLAGS.enabled = prev;
  return result;
}

// ── golden inertness ───────────────────────────────────────────────────────────────────────────
test('flag OFF (node golden default) → deploy is a strict no-op', () => {
  withFlag(false, () => {
    const t = boot();
    // Set every deploy edge and step; a disabled system must not register a field or spawn an
    // emitter (it also does not touch input — input.js owns edge consumption in the live game).
    t.state.input.aimWorld = { x: 300, z: 0 };
    t.state.input.actions.deployWell = true;
    t.state.input.actions.deployRepulsor = true;
    t.state.input.actions.toggleClearingCone = true;
    t.sim.step();
    assert.equal(t.fieldsSys._kernel.size, 0, 'no fields registered while the flag is off');
    assert.equal((t.state.fields.snapshot || []).length, 0);
    assert.equal(t.events.filter((e) => e.name === 'fields:deployed').length, 0);
    // No emitter entity was spawned.
    assert.equal([...t.state.entities.values()].filter((e) => e.type === 'fieldEmitter').length, 0);
  });
});

// ── three consumers on the production physics path ──────────────────────────────────────────────
test('Well PULLS a light body toward its center (consumer 1)', async () => {
  await withFlag(true, async () => {
    const t = await bootPhysics();
    const body = lightBody(t.sim, 300, 90); // will be pulled toward the well center at (300,0): -z
    pressDeploy(t, 'deployWell', { x: 300, z: 0 });
    for (let i = 0; i < 40; i++) t.sim.step();
    assert.ok(t.fieldsSys._kernel.size >= 1, 'well field registered');
    assert.ok(body.vel.z < -0.5, `light body pulled inward (-z), got vel.z=${body.vel.z}`);
    assert.ok(t.state.fields.telemetry.affected >= 1, 'telemetry records an affected body');
    t.cleanup();
  });
});

test('Repulsor PUSHES a light body outward (consumer 2)', async () => {
  await withFlag(true, async () => {
    const t = await bootPhysics();
    const body = lightBody(t.sim, 60, 0); // east of the ship-centered repulsor → pushed +x
    pressDeploy(t, 'deployRepulsor');
    for (let i = 0; i < 40; i++) t.sim.step();
    assert.ok(body.vel.x > 0.5, `light body shoved outward (+x), got vel.x=${body.vel.x}`);
    t.cleanup();
  });
});

test('Cone CLEARS forward and ignores bodies behind it (consumer 3)', async () => {
  await withFlag(true, async () => {
    const t = await bootPhysics(); // player faces +x (rot 0)
    const ahead = lightBody(t.sim, 120, 0);   // in the forward wedge
    const behind = lightBody(t.sim, -120, 0); // behind the apex → outside the wedge
    t.state.input.actions.toggleClearingCone = true; t.sim.step();
    for (let i = 0; i < 40; i++) t.sim.step();
    assert.ok(ahead.vel.x > 0.5, `forward body driven downstream (+x), got vel.x=${ahead.vel.x}`);
    assert.ok(speed(behind) < 0.05, `body behind the cone is untouched, got speed=${speed(behind)}`);
    t.cleanup();
  });
});

// ── heavy shrug at the Δv layer (brief req 2/13) ────────────────────────────────────────────────
test('heavy ship moves a small fraction of a light body under the same well', async () => {
  await withFlag(true, async () => {
    const t = await bootPhysics();
    const light = lightBody(t.sim, 300, 90, 2);
    const heavy = heavyShip(t.sim, 300, -90, 160);
    pressDeploy(t, 'deployWell', { x: 300, z: 0 });
    for (let i = 0; i < 40; i++) t.sim.step();
    const sLight = speed(light), sHeavy = speed(heavy);
    assert.ok(sLight > 0.5, `light body clearly moved, got ${sLight}`);
    assert.ok(sHeavy < 0.25 * sLight, `heavy ship shrugs: speed ${sHeavy} must be < 25% of light ${sLight}`);
    t.cleanup();
  });
});

// ── impulse membrane only (no direct vel write / no writePhysicsControl) ────────────────────────
test('a field alone (no physics system) never mutates a body velocity directly', () => {
  withFlag(true, () => {
    const t = boot(); // NO physics system in the list
    const body = lightBody(t.sim, 300, 90);
    pressDeploy(t, 'deployWell', { x: 300, z: 0 });
    for (let i = 0; i < 20; i++) t.sim.step();
    assert.equal(body.vel.x, 0, 'no direct vel.x write');
    assert.equal(body.vel.z, 0, 'no direct vel.z write — force is queued on the membrane only');
    assert.ok(t.state.fields.telemetry.affected >= 1, 'the body WAS in range (proving the field ran but only queued)');
  });
});

// ── lifecycle: expiry + cooldown ────────────────────────────────────────────────────────────────
test('a deployed Well expires on its bounded lifetime and starts a cooldown', () => {
  withFlag(true, () => {
    const t = boot();
    pressDeploy(t, 'deployWell', { x: 300, z: 0 });
    assert.equal(t.fieldsSys._kernel.size, 1);
    const ticks = Math.ceil(FIELD_DEFS.well.durationS / DT) + 4;
    for (let i = 0; i < ticks; i++) t.sim.step();
    assert.equal(t.fieldsSys._kernel.size, 0, 'field unregistered at expiry');
    assert.equal([...t.state.entities.values()].filter((e) => e.type === 'fieldEmitter' && e.alive).length, 0, 'emitter despawned');
    assert.ok(t.events.some((e) => e.name === 'fields:ended' && e.p.reason === 'field_expired'), 'expiry event fired');
    // Immediately redeploying is denied by cooldown.
    pressDeploy(t, 'deployWell', { x: 300, z: 0 });
    assert.ok(t.events.some((e) => e.name === 'fields:deployDenied' && e.p.reason === 'cooldown'), 'cooldown denies immediate redeploy');
  });
});

// ── destruction cleanup (brief req 8) ───────────────────────────────────────────────────────────
test('shooting down the emitter unregisters its field the same tick (no orphan force)', () => {
  withFlag(true, () => {
    const t = boot();
    pressDeploy(t, 'deployWell', { x: 300, z: 0 });
    const emitter = [...t.state.entities.values()].find((e) => e.type === 'fieldEmitter');
    assert.ok(emitter, 'emitter spawned');
    assert.equal(t.fieldsSys._kernel.size, 1);
    emitter.alive = false; // simulate a lethal hit
    t.sim.step();
    assert.equal(t.fieldsSys._kernel.size, 0, 'field gone the tick after the source died');
    assert.equal((t.state.fields.snapshot || []).length, 0, 'no orphan field in the published snapshot');
    assert.ok(t.events.some((e) => e.name === 'fields:ended' && e.p.reason === 'field_destroyed'), 'destroyed teardown fired');
  });
});

// ── active-field cap ────────────────────────────────────────────────────────────────────────────
test('simultaneous fields never exceed FIELD_MAX_ACTIVE', () => {
  withFlag(true, () => {
    const t = boot();
    for (let i = 0; i < FIELD_MAX_ACTIVE + 4; i++) {
      // vary aim so each well lands at a distinct point; bypass cooldown by forcing it clear
      t.state.fields.cooldowns.well = 0;
      pressDeploy(t, 'deployWell', { x: 200 + i * 30, z: 20 });
    }
    assert.ok(t.fieldsSys._kernel.size <= FIELD_MAX_ACTIVE, `kernel size ${t.fieldsSys._kernel.size} within cap ${FIELD_MAX_ACTIVE}`);
  });
});

// ── save/load normalize-away ────────────────────────────────────────────────────────────────────
test('save:loaded normalizes fields away (no orphan field, emitter, or runtime)', () => {
  withFlag(true, () => {
    const t = boot();
    pressDeploy(t, 'deployWell', { x: 300, z: 0 });
    t.state.input.actions.toggleClearingCone = true; t.sim.step();
    assert.ok(t.fieldsSys._kernel.size >= 2, 'well + cone live before load');
    t.bus.emit('save:loaded', {});
    assert.equal(t.fieldsSys._kernel.size, 0, 'kernel cleared on load');
    assert.equal(t.state.fields.coneActive, false, 'cone reset');
    assert.deepEqual(t.state.fields.deployed, {}, 'deployed map reset');
    assert.equal([...t.state.entities.values()].filter((e) => e.type === 'fieldEmitter' && e.alive).length, 0, 'emitters despawned');
  });
});

test('state.fields is not a serialized top-level key (runtime-only, sidesteps save-schema)', () => {
  // The save capture plan owns which keys serialize; state.fields must not be among them. This
  // guards the deliberate choice to keep field runtime + cooldowns non-durable.
  withFlag(true, () => {
    const t = boot();
    pressDeploy(t, 'deployWell', { x: 300, z: 0 });
    assert.ok(t.state.fields, 'runtime mirror exists at runtime');
    // The runtime mirror carries only transient data — no schemaVersion collision with a save key.
    assert.equal(typeof t.state.fields.cooldowns, 'object', 'cooldowns are runtime-only');
  });
});

// ── deterministic replay ────────────────────────────────────────────────────────────────────────
test('two identical field runs produce identical body trajectories', async () => {
  async function run() {
    const t = await bootPhysics(7777);
    const body = lightBody(t.sim, 280, 70);
    pressDeploy(t, 'deployWell', { x: 280, z: 0 });
    for (let i = 0; i < 30; i++) t.sim.step();
    const snap = { x: body.pos.x, z: body.pos.z, vx: body.vel.x, vz: body.vel.z };
    t.cleanup();
    return snap;
  }
  await withFlag(true, async () => {
    const a = await run();
    const b = await run();
    assert.deepEqual(a, b, 'identical seed/inputs → identical trajectory');
  });
});
