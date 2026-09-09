/**
 * PQ-011 / SF-11 — Deployable Anchor Mass Seed: ADVERSARIAL HARDENING coverage.
 *
 * Companion to test/mass-seed.test.mjs. Every test here PASSES against the current implementation
 * and pins behavior the base suite does not exercise: physics-authority membrane classification,
 * far-from-origin + frame-rebase, fixed-step decomposition / whole-sim pause, destruction in the
 * locking/warning phases + dying-seed + force-removal, save in travel/locking/warning/collapsing,
 * docked-pause suspension, same-tick boundaries, and the tether-cut loop over multiple attachments.
 *
 * Findings that FAIL against the current implementation live in test/mass-seed-findings.test.mjs.
 *
 * Harness mirrors the base suite (curated sim host, production relative update order:
 * massSeed → physics → combat → tetherGameplay). Rapier-backed cases boot the real SG-02 authority.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { advanceFixedTimestep } from '../src/core/loop.js';
import { massSeed, isMassSeedTetherEligible } from '../src/systems/massSeed.js';
import { MASS_SEED_DEF, MASS_SEED_CUT_REASONS } from '../src/data/massSeed.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { physics } from '../src/core/physics.js';
import { save } from '../src/save/saveSystem.js';

const DT = SIM_DT;
const TICKS = { travel: 96, locking: 18, warning: 360, anchor: 1800, collapse: 27, cooldown: 480 };

const LIFECYCLE_EVENTS = [
  'massSeed:deployed', 'massSeed:locking', 'massSeed:locked', 'massSeed:warning',
  'massSeed:collapsing', 'massSeed:collapsed', 'massSeed:destroyed', 'massSeed:cleared',
  'massSeed:tetherCut', 'massSeed:deployDenied',
  'tether:latched', 'tether:latchDenied', 'tether:attached', 'tether:broken', 'tether:broke',
  'tether:released', 'entity:killed', 'presentation:vfxCue', 'toast', 'audio:cue',
];

function boot(seed = 5101, { withPhysics = false, bus = null } = {}) {
  const sim = createSimulation({
    seed,
    bus: bus || createBus(),
    systems: withPhysics ? [massSeed, physics, combat, tetherGameplay] : [massSeed, combat, tetherGameplay],
  });
  const { state, helpers } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 200, hullMax: 200, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of LIFECYCLE_EVENTS) sim.bus.on(name, (p) => events.push({ name, p, tick: state.tick }));
  return {
    sim, state, bus: sim.bus, helpers, player, events,
    massSeedSys: sim.registry.get('massSeed'),
    combatSys: sim.registry.get('combat'),
    tetherSys: sim.registry.get('tetherGameplay'),
    physicsSys: sim.registry.get('physics'),
  };
}

async function bootPhysics(seed = 5201) {
  const t = boot(seed, { withPhysics: true });
  t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const ready = await t.physicsSys.prepareBackend(t.state);
  assert.equal(ready, true, 'SG-02 rapier-dynamic backend should initialize headless');
  assert(t.physicsSys._sg02, 'SG-02 body owner live');
  t.cleanup = () => {
    if (typeof t.physicsSys._disableSg02DynamicAuthority === 'function') t.physicsSys._disableSg02DynamicAuthority();
  };
  return t;
}

function deployNow(t, aim = { x: 500, z: 0 }) {
  t.state.input.aimWorld = aim;
  t.state.input.actions.deployMassSeed = true;
  t.sim.step();
  assert.equal(t.state.input.actions.deployMassSeed, false, 'deploy edge must be consumed');
}

function seedEntity(t) {
  const id = t.state.massSeed && t.state.massSeed.seedId;
  return id == null ? null : t.state.entities.get(id) || null;
}

function runUntil(t, pred, maxTicks) {
  for (let i = 0; i < maxTicks; i++) {
    if (pred()) return true;
    t.sim.step();
  }
  return pred();
}

function activeAttachments(t) {
  return Object.values(t.state.combat.attachments.byId).filter((a) => a && a.state === 'active');
}

function eventsNamed(t, name) {
  return t.events.filter((e) => e.name === name);
}

function teleportPlayer(t, x, z) {
  t.player.pos.x = x; t.player.pos.z = z;
  t.player.prevPos.x = x; t.player.prevPos.z = z;
  t.player.vel.x = 0; t.player.vel.z = 0; t.player.angVel = 0;
  t.player.physicsBody = { ...t.player.physicsBody, revision: (t.player.physicsBody.revision || 0) + 1 };
  t.sim.step();
}

async function deployAndLatch(t, aim = { x: 500, z: 0 }) {
  deployNow(t, aim);
  const deployed = eventsNamed(t, 'massSeed:deployed').at(-1).p;
  assert(runUntil(t, () => t.state.massSeed.phase === 'active', TICKS.travel + TICKS.locking + 4), 'seed reaches active');
  teleportPlayer(t, deployed.lockPos.x - 38, deployed.lockPos.z);
  assert(runUntil(t, () => {
    const sel = t.state.masslineAcquisition && t.state.masslineAcquisition.selected;
    return sel && sel.targetId === t.state.massSeed.seedId && sel.status === 'ready';
  }, 40), 'acquisition preview selects the locked seed');
  t.state.input.actions.tetherFire = true;
  t.sim.step();
  t.state.input.actions.tetherFire = false;
  const latched = eventsNamed(t, 'tether:latched').at(-1);
  assert(latched, 'latch succeeds on the locked seed');
  return { deployed, attachment: activeAttachments(t)[0] };
}

// ── A. physics-authority membrane ─────────────────────────────────────────────────────────
// The seed is authored dynamic:false its whole life, so entity.pos/vel are physics INPUTS
// (authoring a fixed body), never solver outputs. It must classify ONLY as a physics static.
test('ADV-A1 membrane: seed is always a physics STATIC, never a dynamic body, in every phase', () => {
  const t = boot(5111);
  deployNow(t);
  const seedId = t.state.massSeed.seedId;
  const seenPhases = new Set();
  for (let i = 0; i < TICKS.travel + TICKS.anchor + TICKS.collapse + 40 && t.state.massSeed.phase !== 'idle'; i++) {
    const idx = t.state.entityIndex;
    const seed = t.state.entities.get(seedId);
    if (seed && seed.alive !== false) {
      seenPhases.add(t.state.massSeed.phase);
      // Authored spec: fixed body in EVERY live phase (travel ghost + locked rock are both fixed).
      assert.equal(seed.physicsBody.dynamic, false, `seed body dynamic:false in ${t.state.massSeed.phase}`);
      // Index classification: static layer only, never the dynamic layer.
      assert(idx.physicsStatics.includes(seed), `seed in physicsStatics during ${t.state.massSeed.phase}`);
      assert(!idx.physicsDynamics.includes(seed), `seed NEVER in physicsDynamics during ${t.state.massSeed.phase}`);
      // Movable spatial membership (so the hash bucket follows entity.pos) — the deliberate split.
      assert(idx.movables.includes(seed), `seed is spatially movable during ${t.state.massSeed.phase}`);
    }
    t.sim.step();
  }
  assert(seenPhases.has('travel') && seenPhases.has('locking') && seenPhases.has('active') &&
    seenPhases.has('warning') && seenPhases.has('collapsing'), `sampled all live phases (${[...seenPhases]})`);
});

test('ADV-A2 membrane: material flips ghost→rock→ghost drive physicsStaticVersion bumps (record invalidation)', () => {
  const t = boot(5112);
  const v0 = t.state.entityIndex.physicsStaticVersion;
  deployNow(t);
  const seed = seedEntity(t);
  assert.equal(seed.physicsBody.material, 'projectile', 'travel body is the ghost projectile material');
  const vSpawn = t.state.entityIndex.physicsStaticVersion;
  assert(vSpawn > v0, 'spawning the seed bumps the static version (append path)');
  // Lock: ghost → rock, revision bumped, version bumped so SG-02 re-evaluates the static record.
  assert(runUntil(t, () => t.state.massSeed.phase === 'locking', TICKS.travel + 4), 'reaches locking');
  const lockedSeed = seedEntity(t);
  assert.equal(lockedSeed.physicsBody.material, 'rock', 'locked body is the solid rock material');
  assert(lockedSeed.physicsBody.revision >= 1, 'revision advanced on the authored material flip');
  const vLock = t.state.entityIndex.physicsStaticVersion;
  assert(vLock > vSpawn, 'the frame-lock material flip bumps the static version (mid-life invalidation)');
  // Collapse: rock → ghost again (contacts off for the beat), another version bump.
  assert(runUntil(t, () => t.state.massSeed.phase === 'collapsing', TICKS.anchor + 40), 'reaches collapsing');
  const collapsingSeed = t.state.entities.get(t.state.massSeed.seedId);
  if (collapsingSeed) assert.equal(collapsingSeed.physicsBody.material, 'projectile', 'collapse flips back to ghost');
});

test('ADV-A3 membrane (SG-02 live): a locked+tethered seed owns exactly one static body and one joint; never dynamic', async () => {
  const t = await bootPhysics(5213);
  try {
    await deployAndLatch(t);
    const seedId = t.state.massSeed.seedId;
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 1, 'SG-02 owns one rope');
    // The seed is a static fixed body: run some sim and confirm the diagnostics never grow a
    // dynamic body for it and the seed stays bit-exact where it locked.
    const seed = t.state.entities.get(seedId);
    const lockX = seed.pos.x; const lockZ = seed.pos.z;
    for (let i = 0; i < 60; i++) t.sim.step();
    assert.equal(seed.pos.x, lockX, 'fixed anchor x bit-exact (no solver motion)');
    assert.equal(seed.pos.z, lockZ, 'fixed anchor z bit-exact (no solver motion)');
    assert(!t.state.entityIndex.physicsDynamics.includes(seed), 'seed never joins physicsDynamics under live SG-02');
  } finally {
    t.cleanup();
  }
});

// ── B. far-from-origin + frame rebase ─────────────────────────────────────────────────────
// sim coordinates are global; the base suite never leaves small coords. Deploying at x≈50000 must
// produce the SAME geometry translated by the offset, with identical timing/phase/events.
test('ADV-B1 far-from-origin: deploy at x≈50000 is the origin lifecycle translated (+50000), bit-exact', () => {
  const OFFSET = 50000;
  function profileAt(px) {
    const t = boot(5121);
    t.player.pos.x = px; t.player.pos.z = 0;
    deployNow(t, { x: px + 500, z: 0 });
    const deployed = eventsNamed(t, 'massSeed:deployed').at(-1).p;
    assert(runUntil(t, () => t.state.massSeed.phase === 'locking', TICKS.travel + 4), 'reaches locking');
    const e = seedEntity(t);
    return {
      spawnX: deployed.spawnPos.x, lockX: deployed.lockPos.x,
      lockingTick: t.state.tick, entityLockX: e.pos.x, vel: { x: e.vel.x, z: e.vel.z, a: e.angVel },
    };
  }
  const base = profileAt(0);
  const far = profileAt(OFFSET);
  assert.equal(far.spawnX - base.spawnX, OFFSET, 'spawn translates exactly by the offset');
  assert.equal(far.lockX - base.lockX, OFFSET, 'published lock point translates exactly');
  assert.equal(far.entityLockX - base.entityLockX, OFFSET, 'entity lock pose translates exactly');
  assert.equal(far.lockingTick, base.lockingTick, 'timing identical far from origin (simTime-driven)');
  assert.deepEqual(far.vel, base.vel, 'velocity reconciled to zero regardless of global position');
  assert.deepEqual(far.vel, { x: 0, z: 0, a: 0 }, 'zero residual velocity at lock');
});

test('ADV-B2 frame rebase mid-life (SG-02 live): a rebase reprojects the anchor body; global pose + tether survive', async () => {
  const t = await bootPhysics(5222);
  try {
    const { attachment } = await deployAndLatch(t);
    const seed = t.state.entities.get(t.state.massSeed.seedId);
    const gx = seed.pos.x, gz = seed.pos.z;
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 1, 'joint live pre-rebase');
    // Simulate the coordinate owner rebasing the render/physics frame far away (the seam SG-02
    // reprojects through setFrameOrigin). Sim entity.pos is global and must NOT change.
    t.state.world.frameOrigin = { x: 49152, z: 0 };
    t.state.world.frameOriginSeq = (t.state.world.frameOriginSeq || 0) + 1;
    for (let i = 0; i < 5; i++) t.sim.step();
    assert.equal(seed.pos.x, gx, 'global anchor x unchanged by a frame rebase');
    assert.equal(seed.pos.z, gz, 'global anchor z unchanged by a frame rebase');
    assert.equal(t.physicsSys._sg02.diagnostics().frameOriginSeq >= 1, true, 'SG-02 observed the rebase');
    const live = t.state.combat.attachments.byId[attachment.id];
    assert.equal(live.state, 'active', 'tether survives the rebase (no spurious break)');
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 1, 'joint still owned after reprojection');
  } finally {
    t.cleanup();
  }
});

// ── C. fixed-step decomposition + whole-sim pause ─────────────────────────────────────────
// The real loop only ever calls step(1/60); under a hitch it runs MORE 1/60 sub-steps (capped),
// never a larger dt. So the lifecycle is decomposition-invariant, and timeScale 0 freezes it.
test('ADV-C1 pause: timeScale 0 runs zero sim steps (docked/modal freeze); the seed cannot advance', () => {
  const t = boot(5131);
  deployNow(t);
  const phaseBefore = t.state.massSeed.phase;
  const simBefore = t.state.simTime;
  let steps = 0;
  const out = { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  // Advance a full wall second of frames with timeScale 0 (the pause request scale).
  for (let f = 0; f < 60; f++) advanceFixedTimestep(t.state.accumulator, 1 / 60, 0, () => { steps++; t.sim.step(); }, out);
  assert.equal(steps, 0, 'no sim steps occur while paused (timeScale 0)');
  assert.equal(t.state.massSeed.phase, phaseBefore, 'seed phase frozen while paused');
  assert.equal(t.state.simTime, simBefore, 'simTime frozen while paused — no "advance while docked"');
});

test('ADV-C2 hitch: a big frame delta advances via capped 1/60 sub-steps; the lifecycle is decomposition-invariant', () => {
  // Every step is exactly 1/60 in BOTH drivers, so the TICK-TAGGED event stream (each event carries
  // the tick it fired on) is identical regardless of how frames batch the sub-steps. (Per-iteration
  // position sampling would NOT be comparable — iterations advance different tick counts.)
  function streamOf(drive) {
    const t = boot(5132);
    deployNow(t);
    let guard = 0;
    while (t.state.massSeed.phase !== 'idle' && guard < 8000) { drive(t); guard++; }
    return JSON.stringify({
      events: t.events.filter((e) => e.name.startsWith('massSeed:')).map((e) => [e.tick, e.name, e.p && e.p.reason || null]),
      cooldown: Math.round(t.state.player.massSeed.cooldownUntil * 600),
    });
  }
  // Driver A: one fixed step per iteration (steady 60 fps).
  const steady = streamOf((t) => t.sim.step());
  // Driver B: irregular frames through the real accumulator — long frames run several 1/60 sub-steps
  // (never above the shed cap), short frames run zero — yet every executed step is exactly 1/60.
  const out = { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  let toggle = 0;
  const hitched = streamOf((t) => {
    const frameDt = (toggle++ % 3 === 0) ? 0.05 : 0.008; // 3 sub-steps or a sub-tick fragment
    advanceFixedTimestep(t.state.accumulator, frameDt, 1, () => t.sim.step(), out);
    t.state.accumulator = out.accumulator;
  });
  assert.equal(hitched, steady, 'irregular-frame catch-up yields an identical tick-tagged event stream');
});

// ── D. destruction in EVERY phase (base suite only covers travel + active-tethered) ────────
test('ADV-D1 destruction while LOCKING: seed_destroyed, entity swept, cooldown set, no tether existed', () => {
  const t = boot(5141);
  const raider = t.sim.spawn({ type: 'ship', team: 1, pos: { x: 300, z: 20 }, radius: 12, collides: true, hull: 100, hullMax: 100, data: { combatProfileId: 'combat_profile_standard_ship' } });
  deployNow(t);
  const seedId = t.state.massSeed.seedId;
  assert(runUntil(t, () => t.state.massSeed.phase === 'locking', TICKS.travel + 4), 'reaches locking');
  t.bus.emit('projectile:hit', { targetId: seedId, ownerId: raider.id, damage: 999, damageType: 'kinetic', pos: { x: 400, z: 0 }, penetration: 1 });
  assert(runUntil(t, () => t.state.massSeed.phase === 'idle', 10), 'destroyed out of locking');
  assert.equal(eventsNamed(t, 'massSeed:destroyed').length, 1, 'exactly one destroyed event');
  assert.equal(eventsNamed(t, 'massSeed:destroyed').at(-1).p.reason, MASS_SEED_CUT_REASONS.destroyed);
  assert.equal(eventsNamed(t, 'massSeed:tetherCut').length, 0, 'no tether to cut while locking');
  assert.equal(t.state.entities.get(seedId) || null, null, 'seed entity swept');
  assert(t.state.player.massSeed.cooldownUntil > 0, 'cooldown starts on a locking-phase kill');
});

test('ADV-D2 destruction while WARNING (tethered): cut FIRST with seed_destroyed; joint + entity gone', async () => {
  const t = await bootPhysics(5242);
  try {
    const { attachment } = await deployAndLatch(t);
    const seedId = t.state.massSeed.seedId;
    const raider = t.sim.spawn({ type: 'ship', team: 1, pos: { x: 4000, z: 4000 }, radius: 12, collides: true, hull: 100, hullMax: 100, data: { combatProfileId: 'combat_profile_standard_ship' } });
    assert(runUntil(t, () => t.state.massSeed.phase === 'warning', TICKS.anchor + 40), 'reaches warning while tethered');
    t.bus.emit('projectile:hit', { targetId: seedId, ownerId: raider.id, damage: 999, damageType: 'kinetic', pos: { x: 438, z: 0 }, penetration: 1 });
    assert(runUntil(t, () => t.state.massSeed.phase === 'idle', 10), 'destroyed out of warning');
    const cut = eventsNamed(t, 'massSeed:tetherCut').at(-1);
    assert(cut && cut.p.reason === MASS_SEED_CUT_REASONS.destroyed, 'warning-phase kill cuts with seed_destroyed');
    const record = t.state.combat.attachments.byId[attachment.id];
    assert.equal(record.state, 'broken');
    assert.equal(record.breakReason, MASS_SEED_CUT_REASONS.destroyed, 'exact reason wins over the orphan sweep');
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 0, 'joint removed on a warning-phase kill');
    assert.equal(t.state.entities.get(seedId) || null, null, 'seed swept');
  } finally {
    t.cleanup();
  }
});

test('ADV-D3 destroying a REPLACED (dying) seed is benign: dying drains, no orphan, replacement unaffected', () => {
  const t = boot(5143);
  const raider = t.sim.spawn({ type: 'ship', team: 1, pos: { x: 60, z: 20 }, radius: 12, collides: true, hull: 100, hullMax: 100, data: { combatProfileId: 'combat_profile_standard_ship' } });
  deployNow(t);
  const firstId = t.state.massSeed.seedId;
  runUntil(t, () => t.state.tick >= 30, 40);
  deployNow(t); // replacement — firstId retires into ms.dying
  const secondId = t.state.massSeed.seedId;
  assert.notEqual(secondId, firstId);
  assert(t.state.massSeed.dying.some((d) => d.id === firstId), 'old seed is in the dying slot');
  // Kill the DYING seed mid-beat.
  t.bus.emit('projectile:hit', { targetId: firstId, ownerId: raider.id, damage: 999, damageType: 'kinetic', pos: { x: 60, z: 0 }, penetration: 1 });
  for (let i = 0; i < TICKS.collapse + 6; i++) t.sim.step();
  assert.equal(t.state.entities.get(firstId) || null, null, 'dying seed removed');
  assert(!t.state.massSeed.dying.some((d) => d.id === firstId), 'dying slot drained the killed entry');
  assert.equal(t.state.massSeed.seedId, secondId, 'the replacement (newest seed) is untouched');
  assert.notEqual(t.state.massSeed.phase, 'idle', 'replacement still live after the dying-seed kill');
});

test('ADV-D4 target disappearance: force-removing the seed from the entity map triggers a clean destroyed handoff', () => {
  const t = boot(5144);
  deployNow(t);
  const seedId = t.state.massSeed.seedId;
  assert(runUntil(t, () => t.state.massSeed.phase === 'active', TICKS.travel + TICKS.locking + 4), 'active');
  // Yank the entity out of the map WITHOUT setting alive=false (target-disappearance path).
  t.state.entities.delete(seedId);
  t.sim.step();
  assert.equal(t.state.massSeed.phase, 'idle', 'lost target normalizes the mirror');
  assert.equal(eventsNamed(t, 'massSeed:destroyed').at(-1).p.reason, MASS_SEED_CUT_REASONS.destroyed);
  assert(t.state.player.massSeed.cooldownUntil > 0, 'cooldown set on target disappearance');
  // A fresh deploy still works after the handoff.
  t.state.player.massSeed.cooldownUntil = 0;
  deployNow(t);
  assert.equal(t.state.massSeed.phase, 'travel', 'deployable baseline restored');
});

// Coverage-hardening for the DYING_CAP trim (base suite test 18 only presses 8× over 24 ticks, so
// the dying array never actually EXCEEDS the cap and the trim loop is never exercised — a surviving
// mutant there proved the gap). Deploy EVERY tick well past the cap: the array + entity count must
// stay bounded regardless of input abuse.
test('ADV-D5 dying cap: deploying every tick past the cap keeps ms.dying and seed entities bounded', () => {
  const t = boot(5145);
  const DYING_CAP = 8; // src/systems/massSeed.js
  let maxDying = 0;
  let maxSeedEntities = 0;
  for (let i = 0; i < 24; i++) {
    t.state.input.aimWorld = { x: 500, z: 0 };
    t.state.input.actions.deployMassSeed = true; // press EVERY tick (collapse beat is 27 ticks)
    t.sim.step();
    maxDying = Math.max(maxDying, t.state.massSeed.dying.length);
    maxSeedEntities = Math.max(maxSeedEntities, t.state.entityList.filter((e) => e.type === 'massSeed').length);
  }
  assert(maxDying > 4, `the run actually stacked retirements past a trivial count (peak ${maxDying})`);
  assert(maxDying <= DYING_CAP, `ms.dying never exceeds the cap (peak ${maxDying} <= ${DYING_CAP})`);
  // Bounded live entities: at most the cap of collapsing beats + the one live newest seed (+slack).
  assert(maxSeedEntities <= DYING_CAP + 2, `seed entity count stays bounded under spam (peak ${maxSeedEntities})`);
  // A lifecycle clear drains everything.
  t.bus.emit('sector:exit', { sectorId: 'sector_spam' });
  for (let i = 0; i < 4; i++) t.sim.step();
  assert.equal(t.state.massSeed.dying.length, 0, 'clear flushes all retired beats');
  assert.equal(t.state.entityList.filter((e) => e.type === 'massSeed').length, 0, 'zero seed entities after clear');
});

// ── E. save / Continue in the phases the base suite does not cover ─────────────────────────
function wireSave(t) {
  t.state.world.currentSectorId = 'sector_test_massseed';
  const worldStub = {
    serialize: () => ({ currentSectorId: t.state.world.currentSectorId }),
    deserialize(d = {}) { t.state.world.currentSectorId = d.currentSectorId || 'sector_test_massseed'; },
    enterSector(sectorId) { t.state.world.currentSectorId = sectorId; t.bus.emit('sector:enter', { sectorId }); },
  };
  const missionsStub = { serialize: () => ({ boards: {}, active: [], completedLog: [], nextId: 1, story: t.state.story }), deserialize() {}, spawnTargetsForSector() {} };
  const simRegistry = t.sim.registry;
  save.state = t.state; save.bus = t.bus; save.helpers = t.helpers;
  save.registry = {
    get(name) {
      return {
        economy: { serialize: () => ({}), deserialize() {} },
        factions: { serialize: () => ({}), deserialize() {} },
        world: worldStub,
        ships: { recomputeActiveShip() {} },
        cargo: { recompute() {} },
        missions: missionsStub,
        automation: { serialize: () => t.state.automation, deserialize(d) { t.state.automation = d || t.state.automation; } },
        crafting: { serialize: () => t.state.crafting, deserialize(d) { t.state.crafting = d || { queues: {} }; } },
        sectorSim: { serialize: () => t.state.sectorSim, deserialize(d) { t.state.sectorSim = d || t.state.sectorSim; } },
      }[name] || simRegistry.get(name) || null;
    },
  };
}

for (const phase of ['travel', 'locking', 'warning']) {
  test(`ADV-E1 save/Continue during ${phase}: no seed restored, cooldown truth kept, fresh deploy works`, () => {
    const t = boot(5150 + phase.length);
    wireSave(t);
    deployNow(t);
    const target = phase === 'travel' ? () => t.state.tick >= 30
      : phase === 'locking' ? () => t.state.massSeed.phase === 'locking'
        : () => t.state.massSeed.phase === 'warning';
    assert(runUntil(t, target, TICKS.travel + TICKS.anchor + 40), `reached ${phase}`);
    assert.equal(t.state.massSeed.phase === 'idle', false, `mid-${phase} before save`);
    const saved = save.serialize(`mseed-${phase}`);
    assert.equal(saved.data.entities.persistent.filter((e) => e && e.type === 'massSeed').length, 0, 'seed never serialized');
    assert.equal(save.loadEnvelope(saved, `mseed-${phase}`), true, 'envelope loads');
    assert.equal(t.state.entityList.some((e) => e.type === 'massSeed'), false, `no seed entity after loading a ${phase} save`);
    assert.equal(t.state.massSeed.phase, 'idle', 'mirror normalized to idle on load');
    assert.equal(Object.keys(t.state.combat.attachments.byId).length, 0, 'no orphan attachment restored');
    for (let i = 0; i < 30; i++) t.sim.step();
    assert.equal(t.state.entityList.filter((e) => e.type === 'massSeed').length, 0, 'seed never respawns post-load');
    t.state.player.massSeed.cooldownUntil = 0;
    deployNow(t);
    assert.equal(t.state.massSeed.phase, 'travel', 'a fresh deploy works after a mid-phase load');
  });
}

test('ADV-E2 save during collapsing WITH a dying seed present: everything normalizes away', () => {
  const t = boot(5159);
  wireSave(t);
  deployNow(t);
  runUntil(t, () => t.state.tick >= 30, 40);
  deployNow(t); // replacement → a dying seed exists
  assert(t.state.massSeed.dying.length >= 1, 'a dying seed is present');
  assert(runUntil(t, () => t.state.massSeed.phase === 'collapsing', TICKS.travel + TICKS.anchor + 60), 'newest seed collapsing');
  const saved = save.serialize('mseed-collapsing');
  assert.equal(saved.data.entities.persistent.filter((e) => e && e.type === 'massSeed').length, 0, 'no seed serialized (dying or collapsing)');
  assert.equal(save.loadEnvelope(saved, 'mseed-collapsing'), true, 'loads');
  assert.equal(t.state.entityList.some((e) => e.type === 'massSeed'), false, 'no seed entity after load');
  assert.equal(t.state.massSeed.phase, 'idle', 'mirror idle');
  assert.equal(t.state.massSeed.dying.length, 0, 'dying slot flushed on load');
});

// ── F. docked / modal gating (whole-sim pause) ─────────────────────────────────────────────
// Docking (ui.docked === true) requests timeScale 0 through the SAME time-effects service the
// menu/pause screens use, so the ENTIRE sim suspends — the seed cannot advance, expire, or leak.
test('ADV-F1 docked freeze: a live tethered-window seed is fully suspended and resumes coherently on undock', () => {
  const t = boot(5161);
  const timeEffects = createTimeEffects(t.state); // same service screenManager drives
  deployNow(t);
  assert(runUntil(t, () => t.state.massSeed.phase === 'active', TICKS.travel + TICKS.locking + 6), 'active');
  const phaseAt = t.state.massSeed.phase;
  const expireAt = t.state.massSeed.expireAt;
  const simAtDock = t.state.simTime;

  // Dock: request the pause exactly as screenManager.syncPause does for ui.docked.
  t.state.ui.docked = true;
  timeEffects.set('ui:pausing-screen', { scale: 0 });
  assert.equal(t.state.timeScale, 0, 'docking drives timeScale to 0');

  // Advance a long wall span through the real loop accumulator — zero steps must run.
  let steps = 0;
  const out = { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  for (let f = 0; f < 20 * 60; f++) advanceFixedTimestep(t.state.accumulator, 1 / 60, t.state.timeScale, () => { steps++; t.sim.step(); }, out);
  assert.equal(steps, 0, 'no sim steps while docked (20 wall-seconds elapsed, none advanced)');
  assert.equal(t.state.massSeed.phase, phaseAt, 'seed phase unchanged across a long dock');
  assert.equal(t.state.simTime, simAtDock, 'simTime did not advance while docked (no instant-expiry premise)');
  assert.equal(t.state.massSeed.expireAt, expireAt, 'expiry timestamp untouched');

  // Undock: clear the pause and confirm the lifecycle resumes and completes cleanly.
  t.state.ui.docked = false;
  timeEffects.clear('ui:pausing-screen');
  assert.equal(t.state.timeScale, 1, 'undock restores timeScale');
  assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.anchor + TICKS.collapse + 60), 'resumes and collapses cleanly');
  assert.equal(eventsNamed(t, 'massSeed:collapsed').at(-1).p.reason, MASS_SEED_CUT_REASONS.expired, 'clean expiry after undock');
});

// ── G. same-tick boundaries ────────────────────────────────────────────────────────────────
test('ADV-G1 cooldown boundary: strict-less denial — an elapsed cooldown allows, a future one denies with exact readyAt', () => {
  // preStep advances simTime by dt BEFORE massSeed.update runs, so the `now` massSeed sees on the
  // next step is (current simTime + dt). Anchoring the cooldown to the current simTime therefore
  // exercises the strict `now < cooldownUntil` boundary without fragile float-exact equality.
  const t = boot(5171);
  t.sim.step(); // let simTime settle to a real accumulated value
  t.state.player.massSeed = { cooldownUntil: t.state.simTime }; // elapses exactly as this tick ends
  t.state.input.aimWorld = { x: 500, z: 0 };
  t.state.input.actions.deployMassSeed = true;
  t.sim.step(); // now = simTime_prev + dt  >  cooldownUntil → allowed
  assert.equal(eventsNamed(t, 'massSeed:deployDenied').length, 0, 'a cooldown that just elapsed does not deny');
  assert.equal(eventsNamed(t, 'massSeed:deployed').length, 1, 'deploy allowed the instant the cooldown lapses');

  // A cooldown strictly in the future denies, and the receipt carries the exact readyAt.
  const t2 = boot(5172);
  t2.sim.step();
  const readyAt = t2.state.simTime + 5;
  t2.state.player.massSeed = { cooldownUntil: readyAt };
  t2.state.input.aimWorld = { x: 500, z: 0 };
  t2.state.input.actions.deployMassSeed = true;
  t2.sim.step();
  assert.equal(eventsNamed(t2, 'massSeed:deployDenied').length, 1, 'a future cooldown denies');
  assert.equal(eventsNamed(t2, 'massSeed:deployDenied')[0].p.reason, 'cooldown');
  assert.equal(t2.state.massSeed.lastDenial.readyAt, readyAt, 'denial receipt carries the exact readyAt');
  assert.equal(eventsNamed(t2, 'massSeed:deployed').length, 0);
});

test('ADV-G2 replacement on/near the lock tick stays deterministic (old retires replaced, new travels)', () => {
  const t = boot(5173);
  deployNow(t);
  const firstId = t.state.massSeed.seedId;
  // Advance to the exact lock tick, then deploy again the same tick window.
  assert(runUntil(t, () => t.state.tick >= TICKS.travel - 1, TICKS.travel + 2), 'at the lock boundary');
  deployNow(t);
  const secondId = t.state.massSeed.seedId;
  assert.notEqual(secondId, firstId, 'a new seed launched');
  assert.equal(eventsNamed(t, 'massSeed:collapsing').at(-1).p.reason, MASS_SEED_CUT_REASONS.replaced, 'old retired as replaced');
  assert.equal(t.state.massSeed.phase, 'travel', 'the replacement starts a fresh travel');
  assert.equal(t.state.player.massSeed.cooldownUntil, 0, 'replacement never starts the cooldown');
});

// ── H. tether-cut loop exactness ───────────────────────────────────────────────────────────
// _cutSeedTethers iterates a snapshot (Object.values) and filters by targetId, so mutation during
// the cut is safe and MULTIPLE lines to one seed all cut with the same exact reason.
test('ADV-H1 tether-cut loop: multiple active attachments to one seed all cut with the exact reason', () => {
  const t = boot(5181);
  // Synthesize two active attachments targeting the same seed id and a stub authority that mutates
  // byId inside cut() (deletes the record) — the snapshot iteration must still cut both.
  const seedId = 777;
  t.state.combat.attachments.byId = {
    a1: { id: 'a1', state: 'active', targetId: seedId, ownerId: t.player.id },
    a2: { id: 'a2', state: 'active', targetId: seedId, ownerId: t.player.id },
    other: { id: 'other', state: 'active', targetId: 999, ownerId: t.player.id },
  };
  const cutCalls = [];
  const stubKernel = {
    attachments: {
      cut(id, _by, reason) {
        cutCalls.push({ id, reason });
        // mutate the map mid-iteration to prove snapshot safety
        t.state.combat.attachments.byId[id].state = 'broken';
        return { ok: true };
      },
    },
  };
  // Point the system's attachment-service resolver at the stub via the registry 'actions' slot.
  const realGet = t.sim.registry.get.bind(t.sim.registry);
  t.sim.registry.get = (name) => (name === 'actions' ? { kernel: stubKernel } : realGet(name));
  const cutEvents = [];
  t.bus.on('massSeed:tetherCut', (p) => cutEvents.push(p));
  try {
    const n = t.massSeedSys._cutSeedTethers(t.state, seedId, MASS_SEED_CUT_REASONS.expired);
    assert.equal(n, 2, 'both seed attachments cut, the unrelated one skipped');
    assert.deepEqual(cutCalls.map((c) => c.reason), [MASS_SEED_CUT_REASONS.expired, MASS_SEED_CUT_REASONS.expired], 'exact reason on every cut');
    assert.equal(cutEvents.length, 2, 'a massSeed:tetherCut receipt per cut line');
    assert(cutEvents.every((e) => e.reason === MASS_SEED_CUT_REASONS.expired && e.seedId === seedId), 'receipts carry the exact reason + seed id');
    assert.equal(t.state.combat.attachments.byId.other.state, 'active', 'the unrelated attachment is untouched');
  } finally {
    t.sim.registry.get = realGet;
  }
});
