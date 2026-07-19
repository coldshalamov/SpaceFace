// Wired-features gate for the RCS consumer (ledger RC-3).
//
// test/rcs-jet-mapping.test.mjs proves the RESOLVER maps demand to the right nozzle. That is not
// the same as proving the RENDERER calls it. Gate defect G-2 in the ledger is exactly this trap:
// during Wave 1 a module imported cleanly while throwing on every tick, because only *invoking*
// the function exposes it. So this script does not read source and hope — it INVOKES the shipped
// vfx methods against a stubbed particle pool and inspects the particles that come out.
//
// Physics is real throughout: actuator blocks are produced by stepPropulsion + computeFlightTelemetry,
// never hand-written, so a sign flip anywhere in the chain fails here.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vfx } from '../src/render/vfx.js';
import { computeFlightTelemetry } from '../src/core/flight/flightTelemetry.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;
let checks = 0;
const pass = (msg) => { checks++; console.log(`  ok  ${msg}`); };

/** Real kernel -> real telemetry seam. Nothing about the actuator block is fabricated here. */
function actuatorsFrom(driveId, input, bodyOverrides = {}) {
  const profile = PROPULSION_PROFILES[driveId];
  const body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: 20, inertia: 40, radius: 6, ...bodyOverrides };
  const result = stepPropulsion({ dt: DT, body, input, profile, runtime: createPropulsionRuntime(profile) });
  return { actuators: computeFlightTelemetry({ body, profile, control: { telemetry: result.telemetry } }).actuators, body, result };
}

/**
 * A vfx instance with the GPU pools replaced by recorders. Built with Object.create(vfx) so every
 * method under test is the REAL shipped method — only the leaf primitives are stubbed.
 */
function harness({ actuators, entity, video = {} }) {
  const particles = [];
  const sprites = [];
  const color = () => ({ r: 0, g: 0, b: 0, set() { return this; }, lerp() { return this; } });
  const ctx = Object.create(vfx);
  Object.assign(ctx, {
    _scene: { isScene: true },
    _burst: 1,
    _c0: color(),
    _c1: color(),
    _ctmp: color(),
    _vfxFrameId: 1,
    _driveScratch: { drive: 0, throttle: 0, speed: 0, speedDrive: 0, boost: 0 },
    state: {
      playerId: entity.id,
      entities: new Map([[entity.id, entity]]),
      settings: { video },
      input: {},
      flightRuntime: { telemetry: { actuators } },
    },
    _spawnParticle(x, z, vx, vz, life, size0) { particles.push({ x, z, vx, vz, life, size0 }); },
    _spawnSprite(kind, x, y, z, life, s0, s1, op0) { sprites.push({ kind, x, z, life, op0 }); return {}; },
  });
  return { ctx, particles, sprites };
}

function shipAt(rot = 0, overrides = {}) {
  return { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot, angVel: 0, radius: 6, flags: {}, _flightFrame: { driveId: 'drive_reaction_m' }, ...overrides };
}

console.log('RCS jet wiring (ledger RC-3) — invoking shipped vfx methods\n');

// ---------------------------------------------------------------------------------------------
console.log('1. The renderer fires the OPPOSITE-side jet on a yaw command');
{
  for (const [turn, bowSign, label] of [[1, -1, 'starboard'], [-1, 1, 'port']]) {
    const { actuators } = actuatorsFrom('drive_reaction_m', { turn });
    const e = shipAt(0);
    const { ctx, particles } = harness({ actuators, entity: e });
    const spawned = ctx._emitRcsJets(e, actuators, false);

    assert.ok(spawned > 0 && particles.length > 0,
      `yaw ${label} must spawn real particles through the shipped emitter, got ${particles.length}`);
    // rot = 0 -> nose is +X and starboard is +Z, so hull side is simply the sign of z.
    const bowParticles = particles.filter((p) => p.x > 0);
    const sternParticles = particles.filter((p) => p.x < 0);
    assert.ok(bowParticles.length > 0, `yaw ${label} must fire a bow jet`);
    assert.ok(sternParticles.length > 0, `yaw ${label} must fire a stern jet`);

    const bowSide = Math.sign(bowParticles[0].z);
    const sternSide = Math.sign(sternParticles[0].z);
    assert.equal(bowSide, bowSign, `yawing to ${label}: bow jet is on the wrong hull (z sign ${bowSide})`);
    assert.equal(sternSide, -bowSign, `yawing to ${label}: stern jet must be on the opposite hull`);
    // THE DEFECT: never two jets on the same end of the hull for a pure yaw.
    assert.ok(bowParticles.every((p) => Math.sign(p.z) === bowSide),
      `yawing to ${label} lit BOTH bow jets — this is the exact reported defect`);
    // Exhaust leaves toward the hull the nozzle sits on (it pushes the ship the other way).
    assert.equal(Math.sign(bowParticles[0].vz), bowSide,
      `yawing to ${label}: bow exhaust must leave along the nozzle's own side`);
  }
  pass('a yaw fires one bow jet and the opposite stern jet, never both bow jets');
}

// ---------------------------------------------------------------------------------------------
console.log('2. Strafe and brake reach their own nozzles');
{
  const { actuators } = actuatorsFrom('drive_reaction_m', { strafe: 1 });
  const e = shipAt(0);
  const { ctx, particles } = harness({ actuators, entity: e });
  ctx._emitRcsJets(e, actuators, false);
  assert.ok(particles.length > 0, 'a strafe must spawn particles');
  assert.ok(particles.every((p) => p.z < 0),
    'pushing starboard must fire the PORT-hull pair only (all particles at z<0 at rot 0)');
  assert.ok(particles.some((p) => p.x > 0) && particles.some((p) => p.x < 0),
    'a translation must load bow AND stern, or it would yaw');
  assert.ok(particles.every((p) => p.vz < 0), 'strafe exhaust must leave to port');
  pass('a starboard strafe fires the port pair, bow and stern, with port-ward exhaust');
}
{
  const { actuators } = actuatorsFrom('drive_reaction_m', { throttle: 0, brake: true }, { vel: { x: 40, z: 0 } });
  const e = shipAt(0, { vel: { x: 40, z: 0 } });
  const { ctx, particles } = harness({ actuators, entity: e });
  ctx._emitRcsJets(e, actuators, false);
  assert.ok(particles.length > 0, 'braking must spawn retro particles');
  assert.ok(particles.every((p) => p.x > 0), 'retros must all sit forward of the CoM');
  assert.ok(particles.some((p) => p.z < 0) && particles.some((p) => p.z > 0),
    'braking is the ONE case that legitimately fires both bow jets — the symmetric pair');
  // Exhaust leaves along the nose; ship velocity (+40 x) is added, so vx must exceed it.
  assert.ok(particles.every((p) => p.vx > 40), 'retro exhaust must leave forward, ahead of the hull');
  pass('braking fires the symmetric bow retro pair with forward exhaust');
}

// ---------------------------------------------------------------------------------------------
console.log('3. Jets the pilot never commanded — the point of the seam');
{
  // No turn key at all: the ship is spinning and the flight computer is arresting it.
  const { actuators } = actuatorsFrom('drive_reaction_m', { turn: 0 }, { angVel: 2.4 });
  assert.ok(actuators.yaw < 0, 'precondition: arresting a starboard spin is a port-ward torque');
  const e = shipAt(0, { angVel: 2.4 });
  const { ctx, particles } = harness({ actuators, entity: e });
  ctx._emitRcsJets(e, actuators, false);
  assert.ok(particles.length > 0, 'counter-torque with no input key must still light jets');
  const bow = particles.filter((p) => p.x > 0);
  assert.ok(bow.length > 0 && Math.sign(bow[0].z) === 1,
    'arresting a starboard spin must fire the BOW STARBOARD jet — the opposite of what a key-reader would draw');
  pass('assist counter-torque fires correct jets with zero pilot input');
}
{
  // Assist slip trim: throttle held, no strafe key, ship sliding sideways.
  const { actuators } = actuatorsFrom('drive_reaction_m', { throttle: 1 }, { vel: { x: 10, z: 30 } });
  assert.equal(actuators.assist.reason, 'slip-assist', 'precondition: the kernel is trimming slip');
  assert.equal(actuators.manual.lateral, 0, 'precondition: the pilot is not pressing strafe');
  const e = shipAt(0, { vel: { x: 10, z: 30 } });
  const { ctx, particles } = harness({ actuators, entity: e });
  ctx._emitRcsJets(e, actuators, false);
  assert.ok(particles.length > 0, 'assist slip trim must be visible as real RCS');
  pass('assist slip trim fires jets with no strafe key held');
}

// ---------------------------------------------------------------------------------------------
console.log('4. Intensity is continuous, and quality/accessibility gates are honoured');
{
  const scaleProbe = [];
  for (const angVel of [0, 2.4]) {
    const { actuators } = actuatorsFrom('drive_reaction_m', { turn: angVel === 0 ? 1 : 0 }, { angVel });
    const e = shipAt(0, { angVel });
    const { ctx, particles } = harness({ actuators, entity: e });
    ctx._emitRcsJets(e, actuators, false);
    scaleProbe.push(particles.length);
  }
  assert.ok(scaleProbe[1] >= scaleProbe[0],
    `harder demand must not spawn fewer particles (${scaleProbe[0]} -> ${scaleProbe[1]})`);

  // Low quality still tells the truth, with one particle per jet.
  const { actuators } = actuatorsFrom('drive_reaction_m', { turn: 1 });
  const e = shipAt(0);
  const low = harness({ actuators, entity: e });
  low.ctx._emitRcsJets(e, actuators, true);
  assert.equal(low.particles.length, 2, 'low quality must still fire both jets of the couple, one particle each');
  assert.equal(low.sprites.length, 0, 'low quality must not spawn glow sprites');
  pass('intensity scales with demand; low quality keeps the mapping and drops the ornament');
}
{
  // motionReduce is gated at the call site in _emitTrails, so assert the gate guards the call.
  const src = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
  assert.match(src, /rcsEnabled\s*=\s*!\(video && \(video\.motionReduce/,
    'the RCS pass must be gated on motionReduce');
  assert.match(src, /if \(rcsEnabled\)\s*\{[\s\S]{0,400}?this\._emitRcsJets\(/,
    '_emitRcsJets must be called only inside the rcsEnabled gate');
  pass('motionReduce and engineTrails=false suppress the RCS pass at the call site');
}

// ---------------------------------------------------------------------------------------------
console.log('5. The main plume follows physics, and the retro pair has one owner');
{
  const e = shipAt(0, { vel: { x: 40, z: 0 }, maxSpeed: 120 });
  const braking = actuatorsFrom('drive_reaction_m', { throttle: 0, brake: true }, { vel: { x: 40, z: 0 } }).actuators;
  const withTruth = harness({ actuators: braking, entity: e });
  const brakingDrive = withTruth.ctx._engineDriveFor(e).drive;

  // Same ship, same speed, but no actuator block published (legacy controller): the old
  // speed-derived glow is all that is available, and it keeps the engine lit.
  const blind = harness({ actuators: null, entity: e });
  blind.ctx.state.flightRuntime = null;
  const blindDrive = blind.ctx._engineDriveFor(e).drive;

  assert.ok(brakingDrive < blindDrive,
    `a ship on its retros must show a colder main nozzle than the speed-only guess (${brakingDrive} vs ${blindDrive})`);
  assert.ok(brakingDrive >= 0, 'drive must stay non-negative');
  pass('retro-only braking darkens the main nozzle instead of glowing from speed alone');

  const thrusting = actuatorsFrom('drive_reaction_m', { throttle: 1 }).actuators;
  const e2 = shipAt(0, { maxSpeed: 120 });
  const h2 = harness({ actuators: thrusting, entity: e2 });
  assert.ok(h2.ctx._engineDriveFor(e2).drive > 0.2,
    'commanded thrust must light the plume even from a standstill, where speed-derived terms are zero');
  pass('main-drive demand lights the plume from physics rather than from speed');
}
{
  // The legacy event burst must stand down when the RCS pass owns the retros, or the burn doubles.
  const braking = actuatorsFrom('drive_reaction_m', { throttle: 0, brake: true }, { vel: { x: 40, z: 0 } }).actuators;
  const e = shipAt(0, { vel: { x: 40, z: 0 } });
  const owned = harness({ actuators: braking, entity: e });
  owned.ctx._emitEngineTrail = () => ({ particles: 0, streaks: 0 });
  owned.ctx._onThrust({ id: e.id, shipId: e.id, reverse: 1, throttle: 0, nozzles: [{ role: 'reverse-left', strength: 1 }, { role: 'reverse-right', strength: 1 }] });
  assert.equal(owned.particles.length, 0,
    'with a truthful actuator block the event path must NOT also draw retros (double burn)');

  // ...and must stay live for craft flown by the LEGACY controller. src/systems/flight.js only
  // ever READS `_flightFrame` (:258) and never assigns it, so the absence of that field — not the
  // absence of flightRuntime — is what actually identifies a legacy-controlled craft.
  const legacyShip = shipAt(0, { vel: { x: 40, z: 0 } });
  delete legacyShip._flightFrame;
  const legacy = harness({ actuators: null, entity: legacyShip });
  legacy.ctx.state.flightRuntime = null;
  assert.equal(legacy.ctx._actuatorsFor(legacyShip), null,
    'a craft with no _flightFrame publishes no actuator block, so the legacy path must own its retros');
  legacy.ctx._emitEngineTrail = () => ({ particles: 0, streaks: 0 });
  legacy.ctx._onThrust({ id: legacyShip.id, shipId: legacyShip.id, reverse: 1, throttle: 0, nozzles: [{ role: 'reverse-left', strength: 1 }, { role: 'reverse-right', strength: 1 }] });
  assert.ok(legacy.particles.length > 0,
    'the legacy event path must still render retros for craft with no actuator block');
  pass('the retro pair has exactly one owner, chosen by whether truthful data exists');
}

// ---------------------------------------------------------------------------------------------
console.log('6. The player never depends on the diagnostics publisher being on');
{
  // flightV3.update() returns early before `_publishPlayerDiagnostics` whenever the physics
  // backend is not rapier-dynamic, and the legacy controller never writes flightRuntime at all.
  // If the player branch read only that object, the HERO ship would be the one craft that loses
  // its jets — the precise "producer landed, consumer read nothing" failure this packet closes.
  const profile = PROPULSION_PROFILES.drive_reaction_m;
  const body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: 20, inertia: 40, radius: 6 };
  const stepped = stepPropulsion({ dt: DT, body, input: { turn: 1 }, profile, runtime: createPropulsionRuntime(profile) });

  const e = shipAt(0);
  e._flightFrame = { driveId: 'drive_reaction_m', ...stepped.telemetry };
  const h = harness({ actuators: null, entity: e });
  h.ctx.state.flightRuntime = null; // publisher off, exactly as on a non-rapier backend

  const actuators = h.ctx._actuatorsFor(e);
  assert.ok(actuators, 'the player must resolve actuators from _flightFrame when flightRuntime is absent');
  assert.ok(actuators.yaw > 0, 'the fallback must carry real signed demand, not zeros');

  h.ctx._emitRcsJets(e, actuators, false);
  assert.ok(h.particles.length > 0, 'the player must still fire jets with the diagnostics publisher off');
  const bowP = h.particles.filter((p) => p.x > 0);
  assert.ok(bowP.length > 0 && Math.sign(bowP[0].z) === -1,
    'the fallback path must produce the SAME mapping: yaw→starboard fires the bow PORT jet');
  pass('the player falls back to _flightFrame, with the mapping preserved');
}

// ---------------------------------------------------------------------------------------------
console.log('7. The pass is actually wired into the per-frame loop');
{
  const src = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
  // Behavioural pin, not a spelling pin: the RCS call must sit BEFORE the idle-drive early-out,
  // or a coasting ship that is turning would emit nothing — the original defect, restored.
  const loop = src.slice(src.indexOf('_emitTrails(dt)'));
  const rcsAt = loop.indexOf('_emitRcsJets(');
  const idleAt = loop.indexOf('idle ships emit nothing');
  assert.ok(rcsAt > 0, '_emitTrails must call _emitRcsJets');
  assert.ok(idleAt > 0, 'the idle-drive early-out must still exist');
  assert.ok(rcsAt < idleAt,
    'the RCS pass must run BEFORE the idle-drive early-out, or a coasting ship that turns emits nothing');

  // The contract pinned by check-autopilot-v3 must survive this packet.
  for (const token of ['reverse-left', 'reverse-right', '_emitReverseNozzleTrail']) {
    assert.ok(src.includes(token), `the pre-existing nozzle contract token "${token}" must remain in vfx.js`);
  }
  pass('_emitRcsJets runs before the idle gate; the legacy nozzle contract is intact');
}

console.log(`\nAll ${checks} RCS wiring checks PASSED.`);
