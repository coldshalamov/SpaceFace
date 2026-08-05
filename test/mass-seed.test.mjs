/**
 * PQ-011 / SF-11 — Deployable Anchor Mass Seed: adversarial coverage.
 *
 * Harness: curated sim host (src/core/sim.js) with production systems in production relative
 * update order (massSeed → physics → combat → tetherGameplay). Tether/physics tests boot the real
 * SG-02 Rapier dynamic authority (loads headless; check-sg02-tether.mjs pattern) so latch, joint,
 * and cut behavior are the production code paths — no mocks.
 *
 * Case map (prompt §163-186):
 *   1  lifecycle transition ordering (exact phases, events, tick boundaries)
 *   2  cannot tether before lock (travel AND locking; eligibility is the gate — not range)
 *   3  authorized anchor after lock (latch, joint, seed static under spring load)
 *   4  deterministic lock position/timing (independent contract values, two-run equality)
 *   5  one-seed cap / deterministic replacement (seed_replaced, no cooldown restart)
 *   6  cooldown enforcement (deny + lastDenial, allow after)
 *   7  expiry while untethered
 *   8  expiry while tethered (cut FIRST with seed_expired; joint gone; tether:broke surfaces)
 *   9  hostile destruction while tethered (projectile:hit → kill → seed_destroyed; plus travel)
 *   10 target clearing (mirror + acquisition receipt drop the dead seed; re-latch denied)
 *   11 no ghost attachment/body (exact break reasons; SG-02 joints at zero)
 *   12 save/restore normalization (seed/tether never serialize; live tether cut seed_cleared on
 *      load; cooldown blob round-trips; no duplication)
 *   13 sector exit / game:new / newGame() / repeated initialization
 *   14 old-save defaults (missing player.massSeed → 0; _restorePlayer merges over defaults)
 *   15 identical seeded replay (hash equality — including across DIFFERENT rng seeds)
 *   16 manual target override (cursor paint beats the seed — and can deliberately pick it)
 *   17 reduced settings / presentation (HUD text = primary timing channel; phase materials)
 *   18 bounded allocations/entity counts (repeat lifecycles: no entity/listener/VFX growth)
 *   19 regression: acquirable at the lock point under an ACTIVE spatial hash (the static layer
 *      caches positions by version and would orphan a kinematic seed at its spawn point)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { hasActiveSpatialHash } from '../src/core/spatialQuery.js';
import { massSeed, isMassSeedTetherEligible } from '../src/systems/massSeed.js';
import { MASS_SEED_DEF, MASS_SEED_CUT_REASONS } from '../src/data/massSeed.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { physics } from '../src/core/physics.js';
import { save } from '../src/save/saveSystem.js';
import { massSeedHud, resolveMassSeedLockCue } from '../src/ui/massSeedHud.js';
import { createVisualFactory } from '../src/render/visualFactory.js';

const DT = SIM_DT;
// Independent contract values (published in src/data/massSeed.js and on the HUD at deploy time):
const TRAVEL_DISTANCE = 416; // 260 wu/s × 1.6 s — the HUD lock marker is published from this
const SPAWN_OFFSET = 12 + MASS_SEED_DEF.radius + MASS_SEED_DEF.spawnGap; // player radius 12 → 22
const TICKS = { travel: 96, locking: 18, warning: 360, anchor: 1800, collapse: 27, cooldown: 480 };

const LIFECYCLE_EVENTS = [
  'massSeed:deployed', 'massSeed:locking', 'massSeed:locked', 'massSeed:warning',
  'massSeed:collapsing', 'massSeed:collapsed', 'massSeed:destroyed', 'massSeed:cleared',
  'massSeed:tetherCut', 'massSeed:deployDenied',
  'tether:latched', 'tether:latchDenied', 'tether:attached', 'tether:broken', 'tether:broke',
  'tether:released', 'entity:killed', 'presentation:vfxCue', 'toast', 'audio:cue',
];

function boot(seed = 9101, { withPhysics = false, bus = null } = {}) {
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

async function bootPhysics(seed = 9201) {
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

// Deploy through the ordinary input action edge. Aim (+500, 0) is exactly representable as
// direction (1, 0), so lockPos is bit-exact: (22 + 416, 0) = (438, 0).
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

// Move the player next to the locked anchor under SG-02 authority: bump the authored body
// revision so the physics owner rebuilds the dynamic record at the new pose (the same authored
// rebuild seam the seed's material flip uses) — never a direct Rapier transform write.
function teleportPlayer(t, x, z) {
  t.player.pos.x = x; t.player.pos.z = z;
  t.player.prevPos.x = x; t.player.prevPos.z = z;
  t.player.vel.x = 0; t.player.vel.z = 0; t.player.angVel = 0;
  t.player.physicsBody = { ...t.player.physicsBody, revision: (t.player.physicsBody.revision || 0) + 1 };
  t.sim.step();
}

// Deploy → run to active → teleport into tether range → latch through the ordinary input path.
async function deployAndLatch(t) {
  deployNow(t);
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
  assert.equal(latched.p.targetId, t.state.massSeed.seedId);
  return { deployed, attachment: activeAttachments(t)[0] };
}

// Transitions fire on the first tick whose ACCUMULATED simTime reaches the published timestamp
// (simTime is a running sum, so a boundary landing exactly on a tick can slip one — never more).
function withinTick(eventTick, published, label) {
  const at = eventTick / 60;
  assert(at >= published - 1e-9 && at <= published + 1 / 60 + 1e-9,
    `${label}: fired at ${at.toFixed(4)}s, published ${published.toFixed(4)}s`);
}

// ── 1. legal lifecycle transition ordering ────────────────────────────────────────────────
test('lifecycle: exact phase order, event order, and tick boundaries', () => {
  const t = boot(9101);
  const baseEntities = t.state.entityList.length;
  deployNow(t);
  const deployed = eventsNamed(t, 'massSeed:deployed').at(-1).p;
  assert.deepEqual(deployed.spawnPos, { x: SPAWN_OFFSET, z: 0 });
  assert.deepEqual(deployed.lockPos, { x: SPAWN_OFFSET + TRAVEL_DISTANCE, z: 0 });

  // Phase order sampled after every step: travel → locking → active → warning → collapsing → idle.
  const phases = [t.state.massSeed.phase];
  for (let i = 0; i < TICKS.travel + TICKS.anchor + TICKS.collapse + 30 && t.state.massSeed.phase !== 'idle'; i++) {
    t.sim.step();
    if (t.state.massSeed.phase !== phases.at(-1)) phases.push(t.state.massSeed.phase);
  }
  assert.deepEqual(phases, ['travel', 'locking', 'active', 'warning', 'collapsing', 'idle']);

  const byName = (n) => eventsNamed(t, n).at(-1);
  withinTick(byName('massSeed:locking').tick, deployed.lockAt, 'locking at lockAt');
  withinTick(byName('massSeed:locked').tick, deployed.activeAt, 'active at activeAt');
  withinTick(byName('massSeed:warning').tick, deployed.expireAt - MASS_SEED_DEF.warningS, 'warning 6s before expiry');
  withinTick(byName('massSeed:collapsing').tick, deployed.expireAt, 'collapse at expireAt');
  // Despawn chains off the OBSERVED collapse-begin (which may itself slip one tick).
  withinTick(byName('massSeed:collapsed').tick - byName('massSeed:collapsing').tick, MASS_SEED_DEF.collapseS,
    'despawn one collapse-beat after collapse begins');
  assert.equal(byName('massSeed:collapsed').p.reason, MASS_SEED_CUT_REASONS.expired);

  // Event order is the legal machine path; no destroy/clear events on a clean expiry.
  const order = t.events
    .filter((e) => e.name.startsWith('massSeed:') && e.name !== 'massSeed:deployDenied')
    .map((e) => e.name);
  assert.deepEqual(order, [
    'massSeed:deployed', 'massSeed:locking', 'massSeed:locked', 'massSeed:warning',
    'massSeed:collapsing', 'massSeed:collapsed',
  ]);
  assert.equal(eventsNamed(t, 'massSeed:destroyed').length, 0);
  assert.equal(eventsNamed(t, 'massSeed:cleared').length, 0);

  // Entity is gone; cooldown runs from the moment the seed left the field.
  assert.equal(t.state.entityList.length, baseEntities, 'entity count returns to baseline');
  const collapsedAt = byName('massSeed:collapsed').tick / 60;
  assert(Math.abs(t.state.player.massSeed.cooldownUntil - (collapsedAt + MASS_SEED_DEF.cooldownS)) < 1 / 60 + 1e-6,
    'cooldown starts when the last seed leaves');
});
// ── 2. cannot tether before lock ──────────────────────────────────────────────────────────
test('pre-lock: seed is ineligible in travel AND locking; latch denied through the acquisition gate', async () => {
  const t = await bootPhysics(9202);
  try {
    deployNow(t);
    const seedId = t.state.massSeed.seedId;

    // Mid-travel, in tether range (seed ~126 wu out): the gate is eligibility, not distance.
    runUntil(t, () => t.state.tick >= 30, 40);
    let seed = seedEntity(t);
    assert.equal(t.state.massSeed.phase, 'travel');
    assert.equal(isMassSeedTetherEligible(seed), false, 'published eligibility false in travel');
    const distTravel = Math.hypot(seed.pos.x - t.player.pos.x, seed.pos.z - t.player.pos.z);
    assert(distTravel < 390, `travel sample is inside tether range (${distTravel.toFixed(0)} wu)`);
    t.sim.step(); // idle preview tick publishes the receipt
    assert.equal(t.state.masslineAcquisition && t.state.masslineAcquisition.selected, null,
      'acquisition has no candidate: the ineligible seed never enters ranking');
    t.state.input.actions.tetherFire = true;
    t.sim.step();
    t.state.input.actions.tetherFire = false;
    assert(eventsNamed(t, 'tether:latchDenied').length >= 1, 'latch press denied, never silent');
    assert.equal(activeAttachments(t).length, 0, 'no attachment created in travel');

    // Frame-locking phase: teleport into close range — eligibility must STILL be the blocker.
    assert(runUntil(t, () => t.state.massSeed.phase === 'locking', TICKS.travel + 4), 'reaches locking');
    teleportPlayer(t, t.state.massSeed.lockPos.x - 38, t.state.massSeed.lockPos.z);
    seed = seedEntity(t);
    assert.equal(t.state.massSeed.phase, 'locking');
    assert.equal(isMassSeedTetherEligible(seed), false, 'published eligibility false while locking');
    assert(Math.hypot(seed.pos.x - t.player.pos.x, seed.pos.z - t.player.pos.z) < 390, 'in range at the lock point');
    t.sim.step();
    const selected = t.state.masslineAcquisition && t.state.masslineAcquisition.selected;
    assert(!selected || selected.targetId !== seedId, 'locking seed is not acquirable');
    t.state.input.actions.tetherFire = true;
    t.sim.step();
    t.state.input.actions.tetherFire = false;
    assert.equal(activeAttachments(t).length, 0, 'no attachment created while locking');
    assert.equal(eventsNamed(t, 'tether:attached').length, 0);
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 0, 'no physics joint before lock');
  } finally {
    t.cleanup();
  }
});

// ── 3. authorized anchor behavior after lock ──────────────────────────────────────────────
test('post-lock: latch through ordinary acquisition; anchor body stays fixed under spring load', async () => {
  const t = await bootPhysics(9203);
  try {
    const { deployed, attachment } = await deployAndLatch(t);
    const seed = seedEntity(t);
    assert.equal(isMassSeedTetherEligible(seed), true, 'eligible once active');
    assert(attachment && attachment.state === 'active', 'attachment active');
    assert.equal(attachment.targetId, seed.id);
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 1, 'SG-02 owns one physical rope');

    // The player's own seed scores as neutral (the own→protected gate must not block the feature).
    const receipt = t.state.masslineAcquisition;
    assert.equal(receipt.selected.targetId, seed.id);
    assert.equal(receipt.selected.reasons.ownership, 'neutral', 'own seed is latch-eligible by design');

    // Load the line: one hard impulse away from the anchor (Δv ≈ 7 wu/s), then settle. The
    // ordinary tether spring must transmit force through the joint (tension > 0 — sling energy
    // comes from the spring/momentum exchange, never a scripted bonus) while the FIXED anchor
    // body does not move at all — immovable by construction like an asteroid, never by fake
    // astronomical mass (the Rapier body never sees effectiveMass).
    const lockX = deployed.lockPos.x;
    const lockZ = deployed.lockPos.z;
    let maxTension = 0;
    t.helpers.combatPhysics.applyImpulse({
      entityId: t.player.id, impulse: { x: -200, y: 0, z: 0 }, reason: 'mass_seed_anchor_load', tick: t.state.tick,
    });
    for (let i = 0; i < 180; i++) {
      t.sim.step();
      const live = t.state.combat.attachments.byId[attachment.id];
      if (live) maxTension = Math.max(maxTension, live.lastTension || 0);
    }
    assert.equal(seed.pos.x, lockX, 'anchor x bit-exact under load');
    assert.equal(seed.pos.z, lockZ, 'anchor z bit-exact under load');
    const after = t.state.combat.attachments.byId[attachment.id];
    assert.equal(after.state, 'active', 'line holds under the authored load');
    assert(maxTension > 0, `spring tension flowed through the joint (peak ${maxTension.toFixed(1)})`);
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 1, 'joint still owned by SG-02');
  } finally {
    t.cleanup();
  }
});

// ── 4. deterministic lock position and timing ─────────────────────────────────────────────
test('determinism: lock position/timing exact across runs and independent of rng seed', () => {
  function lockProfile(seed) {
    const t = boot(seed);
    deployNow(t);
    const profile = { deployed: eventsNamed(t, 'massSeed:deployed').at(-1).p };
    assert(runUntil(t, () => t.state.massSeed.phase === 'locking', TICKS.travel + 4));
    profile.lockingTick = t.state.tick;
    const e = seedEntity(t);
    profile.entityPosAtLock = { x: e.pos.x, z: e.pos.z };
    profile.velAtLock = { x: e.vel.x, z: e.vel.z, angVel: e.angVel };
    assert(runUntil(t, () => t.state.massSeed.phase === 'active', TICKS.locking + 4));
    profile.activeTick = t.state.tick;
    return profile;
  }
  const a = lockProfile(9411);
  const b = lockProfile(9411);
  const c = lockProfile(7); // different rng seed: the feature consumes no rng, so identical
  for (const other of [b, c]) {
    assert.deepEqual(other.deployed.lockPos, a.deployed.lockPos);
    assert.deepEqual(other.entityPosAtLock, a.entityPosAtLock);
    assert.equal(other.lockingTick, a.lockingTick);
    assert.equal(other.activeTick, a.activeTick);
  }
  // Independent contract values: spawn offset 22 (12 hull + 7 seed + 3 gap), travel 416 (260×1.6).
  assert.deepEqual(a.deployed.lockPos, { x: 438, z: 0 }, 'lockPos = spawn(22,0) + dir×416');
  assert.deepEqual(a.entityPosAtLock, { x: 438, z: 0 }, 'frame lock lands EXACTLY on the published point');
  assert.deepEqual(a.velAtLock, { x: 0, z: 0, angVel: 0 }, 'velocity reconciled to zero at lock');
  withinTick(a.lockingTick, a.deployed.lockAt, 'lock lands at the published time (deploy + 1.6s)');
  withinTick(a.activeTick, a.deployed.activeAt, 'anchor active after the 0.3s clamp spin-up');
  assert(a.lockingTick - 1 >= TICKS.travel - 1 && a.lockingTick - 1 <= TICKS.travel + 1,
    'travel lasts 1.6s ± one tick of boundary quantization');
});

// ── 5. one-seed cap / deterministic replacement ───────────────────────────────────────────
test('cap: deploying while live collapses the old seed (seed_replaced) and never restarts cooldown', () => {
  const t = boot(9105);
  deployNow(t);
  const firstId = t.state.massSeed.seedId;
  runUntil(t, () => t.state.tick >= 40, 50);
  deployNow(t); // replacement deploy — no cooldown gate while a seed is live
  const secondId = t.state.massSeed.seedId;
  assert.notEqual(secondId, firstId, 'a NEW seed entity launches');
  assert.equal(eventsNamed(t, 'massSeed:collapsing').at(-1).p.reason, MASS_SEED_CUT_REASONS.replaced);
  assert.equal(eventsNamed(t, 'massSeed:deployed').length, 2);

  // At most old-collapsing + new-travelling during the beat; the old one then despawns.
  const seeds = () => t.state.entityList.filter((e) => e.type === 'massSeed');
  assert(seeds().length <= 2, 'never more than old-collapsing + new-travelling');
  runUntil(t, () => seeds().length === 1, TICKS.collapse + 10);
  assert.equal(seeds()[0].id, secondId, 'only the replacement remains');
  assert.equal(eventsNamed(t, 'massSeed:collapsed').at(-1).p.reason, MASS_SEED_CUT_REASONS.replaced);
  assert.equal(t.state.player.massSeed.cooldownUntil, 0, 'replacement does NOT start the cooldown');

  // The replacement runs a full lifecycle; cooldown starts only when the LAST seed leaves.
  assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.travel + TICKS.anchor + TICKS.collapse + 30));
  assert(t.state.player.massSeed.cooldownUntil > 0, 'cooldown starts when the LAST seed leaves');
});

// ── 6. cooldown enforcement ───────────────────────────────────────────────────────────────
test('cooldown: deny with receipt + toast during cooldown, allow after', () => {
  const t = boot(9106);
  deployNow(t);
  assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.travel + TICKS.anchor + TICKS.collapse + 30));
  const readyAt = t.state.player.massSeed.cooldownUntil;
  assert(readyAt > t.state.simTime, 'cooldown in the future after the seed leaves');

  deployNow(t); // press during cooldown — no entity, readable denial
  assert.equal(eventsNamed(t, 'massSeed:deployDenied').length, 1);
  assert.equal(eventsNamed(t, 'massSeed:deployDenied')[0].p.reason, 'cooldown');
  assert.equal(t.state.massSeed.lastDenial.reason, 'cooldown');
  assert.equal(t.state.massSeed.lastDenial.readyAt, readyAt);
  assert.equal(eventsNamed(t, 'massSeed:deployed').length, 1, 'still only the first deploy');
  assert(eventsNamed(t, 'toast').some((e) => /recharging/i.test(e.p && e.p.text || '')), 'player-facing cooldown toast');
  assert.equal(t.state.entityList.filter((e) => e.type === 'massSeed').length, 0);

  runUntil(t, () => t.state.simTime >= readyAt, TICKS.cooldown + 10);
  deployNow(t);
  assert.equal(eventsNamed(t, 'massSeed:deployed').length, 2, 'deploy succeeds once cooldown lapses');
  assert.equal(t.state.massSeed.phase, 'travel');
});

// ── 7. expiry while untethered ────────────────────────────────────────────────────────────
test('expiry untethered: warning → collapse → despawn, no tether events, baseline restored', () => {
  const t = boot(9107);
  const baseEntities = t.state.entityList.length;
  deployNow(t);
  assert(runUntil(t, () => t.state.massSeed.phase === 'warning', TICKS.travel + TICKS.anchor + 30), 'reaches warning');
  const warning = eventsNamed(t, 'massSeed:warning').at(-1);
  assert(warning && warning.p.remainingS <= MASS_SEED_DEF.warningS + 1e-9 && warning.p.remainingS > 0,
    'warning carries remaining seconds (non-color timing)');
  assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.warning + TICKS.collapse + 30), 'collapses to idle');
  assert.equal(eventsNamed(t, 'massSeed:collapsed').at(-1).p.reason, MASS_SEED_CUT_REASONS.expired);
  assert.equal(eventsNamed(t, 'tether:attached').length, 0, 'never tethered');
  assert.equal(eventsNamed(t, 'massSeed:tetherCut').length, 0, 'no cut without a tether');
  assert.equal(activeAttachments(t).length, 0);
  assert.equal(Object.keys(t.state.combat.attachments.byId).length, 0, 'no attachment records at all');
  assert.equal(t.state.entityList.length, baseEntities, 'entity count back to baseline');
  assert.equal(t.state.entityIndex.damageables.some((e) => e.type === 'massSeed'), false, 'index swept the seed');
  assert(t.state.player.massSeed.cooldownUntil > t.state.simTime - 1, 'cooldown running');
});

// ── 8. expiry while tethered ──────────────────────────────────────────────────────────────
test('expiry tethered: cut FIRST with seed_expired through the authority; joint and entity gone', async () => {
  const t = await bootPhysics(9208);
  try {
    const { attachment } = await deployAndLatch(t);
    const seedId = t.state.massSeed.seedId;
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 1, 'joint live before expiry');

    assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.anchor + TICKS.collapse + 30),
      'seed expires and despawns');

    const cut = eventsNamed(t, 'massSeed:tetherCut').at(-1);
    assert(cut, 'seed tether cut emitted');
    assert.equal(cut.p.reason, MASS_SEED_CUT_REASONS.expired, 'exact lifecycle reason on the cut');
    assert.equal(cut.p.attachmentId, attachment.id);
    // Cut lands in massSeed's own tick — BEFORE physics' orphan sweep could rename it.
    const broken = eventsNamed(t, 'tether:broken').find((e) => e.p && e.p.attachmentId === attachment.id);
    assert(broken, 'attachment authority reported the break');
    assert.equal(broken.p.reason, MASS_SEED_CUT_REASONS.expired, 'authority break reason is exact');
    assert(eventsNamed(t, 'tether:broke').length >= 1, 'gameplay layer surfaced the loss to the player');
    const record = t.state.combat.attachments.byId[attachment.id];
    assert.equal(record.state, 'broken');
    assert.equal(record.breakReason, MASS_SEED_CUT_REASONS.expired);
    assert.equal(activeAttachments(t).length, 0, 'no active attachment records');
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 0, 'SG-02 joint removed — no ghost constraint');
    assert.equal(t.state.entities.get(seedId) || null, null, 'seed entity swept');
    assert.equal(t.state.massSeed.phase, 'idle');
    assert(t.state.player.massSeed.cooldownUntil > t.state.simTime - 1, 'cooldown started at despawn');
  } finally {
    t.cleanup();
  }
});

// ── 9. hostile destruction while tethered ─────────────────────────────────────────────────
test('destruction: projectile:hit kills the seed → seed_destroyed cut, joint gone (tethered AND travel)', async () => {
  const t = await bootPhysics(9209);
  try {
    const { attachment } = await deployAndLatch(t);
    const seedId = t.state.massSeed.seedId;
    const raider = t.sim.spawn({
      type: 'ship', team: 1, pos: { x: 420, z: 20 }, radius: 12, collides: true,
      hull: 100, hullMax: 100, data: { combatProfileId: 'combat_profile_standard_ship' },
    });

    // Declared own-team policy (mine parity): the player's OWN guns cannot kill their own seed —
    // routeDamage rejects same-team fire. Counterplay is hostile fire or stray blasts.
    const seedBefore = seedEntity(t);
    t.bus.emit('projectile:hit', {
      targetId: seedId, ownerId: t.player.id, damage: 999, damageType: 'kinetic',
      pos: { x: 438, z: 0 }, penetration: 1,
    });
    t.sim.step();
    assert.equal(seedBefore.alive, true, 'own-team fire is rejected (friendly-fire gate, mine parity)');
    assert.equal(seedBefore.hull, seedBefore.hullMax, 'own-team fire deals no damage');
    assert.equal(t.state.massSeed.phase, 'active', 'seed still anchored after own-team hit');

    // Ordinary hostile weapons route: projectile:hit → combat.onHit → routeDamage → kill.
    t.bus.emit('projectile:hit', {
      targetId: seedId, ownerId: raider.id, damage: 999, damageType: 'kinetic',
      pos: { x: 438, z: 0 }, penetration: 1,
    });
    assert(runUntil(t, () => t.state.massSeed.phase === 'idle', 10), 'destroy detected next tick');
    assert(eventsNamed(t, 'entity:killed').length >= 1, 'combat kernel reported the kill');
    assert.equal(eventsNamed(t, 'massSeed:destroyed').length, 1);
    assert.equal(eventsNamed(t, 'massSeed:tetherCut').at(-1).p.reason, MASS_SEED_CUT_REASONS.destroyed,
      'destruction reason wins over the orphan sweep');
    const record = t.state.combat.attachments.byId[attachment.id];
    assert.equal(record.state, 'broken');
    assert.equal(record.breakReason, MASS_SEED_CUT_REASONS.destroyed);
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 0, 'joint removed on destruction');
    assert.equal(t.state.entities.get(seedId) || null, null, 'seed entity swept');
    assert(t.state.player.massSeed.cooldownUntil > 0, 'cooldown starts on destruction too');
  } finally {
    t.cleanup();
  }

  // Travel-phase kill (hostile fire): no tether involved; cleanup and cooldown still exact.
  const t2 = await bootPhysics(9210);
  try {
    deployNow(t2);
    const seedId = t2.state.massSeed.seedId;
    const raider = t2.sim.spawn({
      type: 'ship', team: 1, pos: { x: 100, z: 20 }, radius: 12, collides: true,
      hull: 100, hullMax: 100, data: { combatProfileId: 'combat_profile_standard_ship' },
    });
    runUntil(t2, () => t2.state.tick >= 20, 30);
    assert.equal(t2.state.massSeed.phase, 'travel');
    t2.bus.emit('projectile:hit', {
      targetId: seedId, ownerId: raider.id, damage: 999, damageType: 'kinetic',
      pos: { x: 100, z: 0 }, penetration: 1,
    });
    assert(runUntil(t2, () => t2.state.massSeed.phase === 'idle', 10), 'travel destroy detected');
    assert.equal(eventsNamed(t2, 'massSeed:destroyed').length, 1);
    assert.equal(eventsNamed(t2, 'massSeed:tetherCut').length, 0, 'no tether existed to cut');
    assert.equal(activeAttachments(t2).length, 0);
    assert.equal(t2.state.entities.get(seedId) || null, null);
    assert(t2.state.player.massSeed.cooldownUntil > 0);
  } finally {
    t2.cleanup();
  }
});

// ── 10. target clearing ───────────────────────────────────────────────────────────────────
test('target clearing: dead seed drops out of the mirror, the receipt, and future latches', async () => {
  const t = await bootPhysics(9211);
  try {
    await deployAndLatch(t);
    const seedId = t.state.massSeed.seedId;
    for (let i = 0; i < 3; i++) t.sim.step(); // let the gameplay mirror refresh post-latch
    assert(t.state.player.tether && t.state.player.tether.active === true, 'mirror shows the live line');
    assert.equal(t.state.player.tether.targetId, seedId);

    // The raider stays FAR away: the kill routes via projectile:hit (proximity irrelevant), and
    // no competing attachable can photobomb the post-kill acquisition checks.
    const raider = t.sim.spawn({
      type: 'ship', team: 1, pos: { x: 4000, z: 4000 }, radius: 12, collides: true,
      hull: 100, hullMax: 100, data: { combatProfileId: 'combat_profile_standard_ship' },
    });
    t.bus.emit('projectile:hit', {
      targetId: seedId, ownerId: raider.id, damage: 999, damageType: 'kinetic', pos: { x: 438, z: 0 },
    });
    assert(runUntil(t, () => t.state.massSeed.phase === 'idle', 10), 'seed destroyed');
    for (let i = 0; i < 10; i++) t.sim.step();

    // Player-facing mirror cleared (the HUD cable/target read derives from it).
    assert(t.state.player.tether.active === false, 'tether mirror inactive after the kill');
    assert.equal(t.state.player.tether.targetId, null, 'no stale target id in the mirror');

    // Acquisition never ranks the corpse: eligibility flips with alive===false.
    const corpse = null; // entity was swept; the pure gate covers both missing and dead shapes
    assert.equal(isMassSeedTetherEligible(corpse), false);
    assert.equal(isMassSeedTetherEligible({ type: 'massSeed', alive: false, data: { massSeedState: { tetherEligible: true } } }), false,
      'even a stale eligible flag cannot revive a dead seed as a target');
    for (let i = 0; i < 10; i++) t.sim.step();
    const selected = t.state.masslineAcquisition && t.state.masslineAcquisition.selected;
    assert(!selected || selected.targetId !== seedId, 'receipt drops the dead seed');

    // Re-latch press: denied, and no attachment can be raised against the dead seed.
    t.state.input.actions.tetherFire = true;
    t.sim.step();
    t.state.input.actions.tetherFire = false;
    assert(eventsNamed(t, 'tether:latchDenied').length >= 1);
    assert.equal(activeAttachments(t).length, 0);
  } finally {
    t.cleanup();
  }
});

// ── 11. no ghost attachment/body ──────────────────────────────────────────────────────────
test('no ghosts: after expiry AND after destruction, zero active records, zero joints, zero bodies', async () => {
  for (const mode of ['expiry', 'destruction']) {
    const t = await bootPhysics(mode === 'expiry' ? 9212 : 9213);
    try {
      await deployAndLatch(t);
      const seedId = t.state.massSeed.seedId;
      if (mode === 'destruction') {
        const raider = t.sim.spawn({
          type: 'ship', team: 1, pos: { x: 420, z: 20 }, radius: 12, collides: true,
          hull: 100, hullMax: 100, data: { combatProfileId: 'combat_profile_standard_ship' },
        });
        t.bus.emit('projectile:hit', {
          targetId: seedId, ownerId: raider.id, damage: 999, damageType: 'kinetic', pos: { x: 438, z: 0 },
        });
      }
      assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.anchor + TICKS.collapse + 30), `${mode} completes`);
      for (let i = 0; i < 30; i++) t.sim.step(); // physics reconcile passes after the loss

      assert.equal(activeAttachments(t).length, 0, `${mode}: no active attachment records`);
      for (const record of Object.values(t.state.combat.attachments.byId)) {
        assert.equal(record.state, 'broken', `${mode}: ledger record settled`);
        assert.equal(record.breakReason, mode === 'expiry' ? MASS_SEED_CUT_REASONS.expired : MASS_SEED_CUT_REASONS.destroyed,
          `${mode}: exact reason survives reconcile passes`);
      }
      assert.equal(t.physicsSys._sg02.diagnostics().attachments, 0, `${mode}: no SG-02 joint`);
      assert.equal(t.state.entityList.some((e) => e.type === 'massSeed'), false, `${mode}: no seed entity`);
      assert.equal(t.state.entityIndex.damageables.some((e) => e.type === 'massSeed'), false, `${mode}: index clean`);
      assert.equal(t.state.entityIndex.physicsStatics.some((e) => e.type === 'massSeed'), false, `${mode}: physics layer clean`);
      const cues = eventsNamed(t, 'presentation:vfxCue').map((e) => e.p && e.p.id);
      assert.deepEqual(cues, ['massSeed.frameLock', 'massSeed.collapse'], `${mode}: exactly two bounded cues`);
    } finally {
      t.cleanup();
    }
  }
});

// ── 12. save/restore normalization ────────────────────────────────────────────────────────
// Save policy: NORMALIZE AWAY. The seed entity never serializes (not player, not persistent), and
// a tether targeting it never serializes either (combat persistence requires both endpoints to be
// player/persistent). The live line is cut with the exact lifecycle reason during the load's
// sector re-entry, before the restored combat state replaces the ledger. Cooldown rides the
// player blob so Continue cannot launder it.
function wireSave(t) {
  t.state.world.currentSectorId = 'sector_test_massseed';
  const worldStub = {
    serialize: () => ({ currentSectorId: t.state.world.currentSectorId }),
    deserialize(d = {}) { t.state.world.currentSectorId = d.currentSectorId || 'sector_test_massseed'; },
    enterSector(sectorId) {
      t.state.world.currentSectorId = sectorId;
      t.bus.emit('sector:enter', { sectorId });
    },
  };
  const missionsStub = {
    serialize: () => ({ boards: {}, active: [], completedLog: [], nextId: 1, story: t.state.story }),
    deserialize() {},
    spawnTargetsForSector() {},
  };
  const simRegistry = t.sim.registry;
  save.state = t.state;
  save.bus = t.bus;
  save.helpers = t.helpers;
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

test('save/restore: seed + tether normalize away with exact reasons; cooldown blob round-trips', async () => {
  const t = await bootPhysics(9214);
  try {
    const { attachment } = await deployAndLatch(t);
    const seedId = t.state.massSeed.seedId;
    wireSave(t);

    const saved = save.serialize('mseed-test');
    assert(saved && saved.data, 'envelope produced');
    assert.equal(saved.data.entities.persistent.filter((e) => e && e.type === 'massSeed').length, 0,
      'seed never serializes as a persistent entity');
    assert(!saved.data.entities.player || saved.data.entities.player.type !== 'massSeed');
    const savedAttachments = Object.values(saved.data.combat.attachments.byId);
    assert.equal(savedAttachments.length, 0,
      'the seed tether never enters the save blob (non-persistent endpoint is dropped)');

    const loadOk = save.loadEnvelope(saved, 'mseed-test');
    assert.equal(loadOk, true, 'envelope loads');

    const cut = eventsNamed(t, 'massSeed:tetherCut').at(-1);
    assert(cut, 'live line was cut during load');
    assert.equal(cut.p.reason, MASS_SEED_CUT_REASONS.cleared, 'exact lifecycle reason, never bare target_lost');
    assert.equal(cut.p.attachmentId, attachment.id);
    assert(eventsNamed(t, 'massSeed:cleared').some((e) => e.p && e.p.reason === MASS_SEED_CUT_REASONS.cleared),
      'lifecycle clear emitted during load');

    assert.equal(t.state.entityList.some((e) => e.type === 'massSeed'), false, 'no seed entity after load');
    assert.equal(t.state.massSeed.phase, 'idle', 'mirror normalized');
    assert.equal(Object.keys(t.state.combat.attachments.byId).length, 0, 'no restored orphan tether');
    assert(t.state.entities.get(t.state.playerId), 'player entity restored');
    for (let i = 0; i < 60; i++) t.sim.step();
    assert.equal(t.state.entityList.filter((e) => e.type === 'massSeed').length, 0, 'seed is never duplicated or respawned');
    assert.equal(activeAttachments(t).length, 0, 'no ghost attachment after settle ticks');
    // Load resets the SG-02 authority on the physics fork (production path); it re-initializes
    // asynchronously on subsequent ticks. Await the re-init before reading diagnostics.
    if (t.physicsSys._sg02Init) await t.physicsSys._sg02Init;
    assert(t.physicsSys._sg02, 'SG-02 authority restored after load');
    assert.equal(t.physicsSys._sg02.diagnostics().attachments, 0, 'no ghost joint after settle ticks');

    // Cooldown blob: a spent seed leaves a real cooldown; the blob must survive a round trip.
    deployNow(t);
    assert.equal(t.state.massSeed.phase, 'travel', 'deploy works post-load');
    assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.travel + TICKS.anchor + TICKS.collapse + 30));
    const spentCooldown = t.state.player.massSeed.cooldownUntil;
    assert(spentCooldown > t.state.simTime, 'real cooldown running');
    const saved2 = save.serialize('mseed-test-2');
    assert.equal(saved2.data.player.massSeed.cooldownUntil, spentCooldown, 'cooldown is on the player blob');
    const loadOk2 = save.loadEnvelope(saved2, 'mseed-test-2');
    assert.equal(loadOk2, true);
    assert.equal(t.state.player.massSeed.cooldownUntil, spentCooldown, 'Continue cannot launder the cooldown');
    deployNow(t);
    assert.equal(eventsNamed(t, 'massSeed:deployDenied').at(-1).p.reason, 'cooldown',
      'restored cooldown still gates deploys');
  } finally {
    t.cleanup();
  }
});

// ── 13. sector exit / new game / repeated initialization ──────────────────────────────────
test('lifecycle clears: sector:exit, sector:enter, game:new, newGame(), and safe re-init', () => {
  const t = boot(9113);

  // sector:exit clears a live seed with the exact lifecycle reason.
  deployNow(t);
  const firstId = t.state.massSeed.seedId;
  t.bus.emit('sector:exit', { sectorId: 'sector_a' });
  assert.equal(t.state.massSeed.phase, 'idle', 'mirror cleared on sector exit');
  let cleared = eventsNamed(t, 'massSeed:cleared').at(-1);
  assert.equal(cleared.p.reason, MASS_SEED_CUT_REASONS.cleared);
  assert.equal(cleared.p.why, 'sector_exit');
  assert.equal(t.state.entities.get(firstId).alive, false, 'entity killed on clear');
  t.sim.step();
  assert.equal(t.state.entities.get(firstId) || null, null, 'entity swept');

  // sector:enter clears too (belt and suspenders — a seed never crosses a boundary).
  deployNow(t);
  const secondId = t.state.massSeed.seedId;
  t.bus.emit('sector:enter', { sectorId: 'sector_b' });
  assert.equal(t.state.massSeed.phase, 'idle');
  cleared = eventsNamed(t, 'massSeed:cleared').at(-1);
  assert.equal(cleared.p.why, 'sector_enter');
  assert.equal(t.state.entities.get(secondId).alive, false);

  // game:new event clears the seed AND newGame() resets the cooldown latch.
  t.state.player.massSeed.cooldownUntil = 999;
  deployNow(t);
  assert.equal(eventsNamed(t, 'massSeed:deployDenied').length, 1, 'cooldown gate live before reset');
  t.massSeedSys.newGame();
  assert.equal(t.state.massSeed.phase, 'idle');
  assert.equal(t.state.player.massSeed.cooldownUntil, 0, 'newGame resets the cooldown');
  deployNow(t);
  assert.equal(t.state.massSeed.phase, 'travel', 'deploy works after newGame');
  t.bus.emit('game:new', {});
  assert.equal(t.state.massSeed.phase, 'idle', 'game:new event clears');

  // Repeated initialization on the same ctx: no throw, state preserved, listeners do not stack.
  const listenerCount = (bus) => [...bus._listeners.values()].reduce((n, s) => n + s.size, 0);
  const before = listenerCount(t.bus);
  t.massSeedSys.init({ state: t.state, bus: t.bus, helpers: t.helpers, registry: t.sim.registry });
  t.massSeedSys.init({ state: t.state, bus: t.bus, helpers: t.helpers, registry: t.sim.registry });
  assert.equal(listenerCount(t.bus), before, 're-init unsubscribes before re-registering');
  deployNow(t);
  const thirdId = t.state.massSeed.seedId;
  t.bus.emit('sector:exit', { sectorId: 'sector_c' });
  assert.equal(eventsNamed(t, 'massSeed:cleared').filter((e) => e.p.seedId === thirdId).length, 1,
    'exactly ONE clear event after double re-init (no stacked listeners)');
  assert.equal(t.state.massSeed.phase, 'idle');
});

// ── 14. old-save defaults ─────────────────────────────────────────────────────────────────
test('old saves: missing player.massSeed defaults to ready; _restorePlayer merges over defaults', () => {
  const t = boot(9114);
  delete t.state.player.massSeed; // pre-PQ-011 save blob: the key simply does not exist
  t.sim.step();
  assert(t.state.player.massSeed && Number.isFinite(t.state.player.massSeed.cooldownUntil),
    'system re-ensures the player slot');
  assert.equal(t.state.player.massSeed.cooldownUntil, 0, 'old save starts ready, never stuck denied');
  deployNow(t);
  assert.equal(t.state.massSeed.phase, 'travel', 'old save can deploy immediately');

  // Merge semantics: a blob WITHOUT the key preserves live defaults; a blob WITH it wins.
  save.state = t.state;
  t.state.player.massSeed.cooldownUntil = 55;
  save._restorePlayer({ credits: 42 });
  assert.equal(t.state.player.massSeed.cooldownUntil, 55, 'absent key → live value preserved');
  assert.equal(t.state.player.credits, 42, 'other keys restore normally');
  save._restorePlayer({ massSeed: { cooldownUntil: 77 } });
  assert.equal(t.state.player.massSeed.cooldownUntil, 77, 'present key → saved value wins');
});

// ── 15. identical seeded replay ───────────────────────────────────────────────────────────
test('replay: full lifecycle hashes identically — even across different rng seeds', () => {
  function digestFor(seed) {
    const t = boot(seed);
    const hash = createHash('sha256');
    deployNow(t);
    for (let i = 0; i < TICKS.travel + TICKS.anchor + TICKS.collapse + 60; i++) {
      t.sim.step();
      const ms = t.state.massSeed;
      const e = seedEntity(t);
      hash.update(JSON.stringify({
        tick: t.state.tick,
        phase: ms.phase,
        pos: e ? [e.pos.x, e.pos.z, e.rot] : null,
        eligible: e && e.data && e.data.massSeedState ? !!e.data.massSeedState.tetherEligible : null,
        dying: Array.isArray(ms.dying) ? ms.dying.length : -1,
      }));
    }
    // Event stream (names + reason/phase fields only — payloads carry no randomness by contract).
    for (const evt of t.events) {
      if (!evt.name.startsWith('massSeed:')) continue;
      hash.update(JSON.stringify([evt.tick, evt.name, evt.p && evt.p.reason || null]));
    }
    hash.update(JSON.stringify({ cooldown: t.state.player.massSeed.cooldownUntil }));
    return hash.digest('hex');
  }
  const a = digestFor(4242);
  const b = digestFor(4242);
  const c = digestFor(99); // different master seed: the feature consumes NO rng and NO wall time
  assert.equal(b, a, 'same seed → identical replay');
  assert.equal(c, a, 'different rng seed → still identical (feature is rng-free)');
});

// ── 16. manual target override ────────────────────────────────────────────────────────────
test('manual override: cursor paint beats the seed — and can deliberately pick the seed', async () => {
  const t = await bootPhysics(9216);
  try {
    const { deployed } = await deployAndLatch(t); // proves the seed wins when alone (control)
    const seedId = t.state.massSeed.seedId;
    const kernel = t.combatSys.ensureKernel();

    // A competing massive anchor 60+ wu from the seed, in range of the player at (lockX-38, 0).
    const rock = t.sim.spawn({
      type: 'asteroid', pos: { x: deployed.lockPos.x - 38, z: 120 }, radius: 30, mass: 5000,
      collides: true, data: {},
    });

    // Cut the ACTIVE line through the authority (setup only), then wait out the relatch guard.
    const cutActive = () => {
      const active = Object.values(t.state.combat.attachments.byId).find((a) => a && a.state === 'active');
      assert(active, 'an active line exists to cut');
      assert.equal(kernel.attachments.cut(active.id, t.player.id, 'tether_cut').ok, true, 'cut accepted');
    };
    cutActive();
    for (let i = 0; i < 20; i++) t.sim.step();

    // Paint the ROCK: an unambiguous cursor paint must beat every ranked candidate, seed included.
    t.state.input.aimWorld = { x: rock.pos.x, z: rock.pos.z };
    assert(runUntil(t, () => {
      const sel = t.state.masslineAcquisition && t.state.masslineAcquisition.selected;
      return sel && sel.targetId === rock.id;
    }, 40), 'painted rock wins the receipt over the seed');
    t.state.input.actions.tetherFire = true;
    t.sim.step();
    t.state.input.actions.tetherFire = false;
    let latched = eventsNamed(t, 'tether:latched').at(-1);
    assert.equal(latched.p.targetId, rock.id, 'manual override preserved: paint beats the seed');

    // Paint the SEED instead: the same grammar deliberately selects it.
    cutActive();
    for (let i = 0; i < 20; i++) t.sim.step();
    t.state.input.aimWorld = { x: deployed.lockPos.x, z: deployed.lockPos.z };
    assert(runUntil(t, () => {
      const sel = t.state.masslineAcquisition && t.state.masslineAcquisition.selected;
      return sel && sel.targetId === seedId;
    }, 40), 'painted seed wins the receipt');
    t.state.input.actions.tetherFire = true;
    t.sim.step();
    t.state.input.actions.tetherFire = false;
    latched = eventsNamed(t, 'tether:latched').at(-1);
    assert.equal(latched.p.targetId, seedId, 'paint can deliberately pick the seed');
    t.state.input.aimWorld = null;
  } finally {
    t.cleanup();
  }
});

// ── 17. reduced settings / presentation ───────────────────────────────────────────────────
test('presentation: an offscreen lock cue follows world bearing instead of mirrored projection', () => {
  const viewport = { viewportWidth: 1440, viewportHeight: 900 };
  const playerPos = { x: 0, z: 0 };

  // Perspective projection mirrors points behind the fixed chase camera. The projected X says
  // right, while the authoritative world/radar bearing for +X is left.
  const behind = resolveMassSeedLockCue({ x: 1520, y: 450, onScreen: false }, {
    ...viewport,
    playerPos,
    targetPos: { x: 416, z: 0 },
  });
  assert.equal(behind.visible, true);
  assert.equal(behind.offscreen, true);
  assert.equal(behind.direction, 'left');
  assert.equal(behind.x, 24);
  assert.match(behind.ariaLabel, /offscreen left/);

  const onscreen = resolveMassSeedLockCue({ x: 640, y: 360, onScreen: true }, {
    ...viewport,
    playerPos,
    targetPos: { x: 0, z: 100 },
  });
  assert.deepEqual(
    { visible: onscreen.visible, offscreen: onscreen.offscreen, direction: onscreen.direction, x: onscreen.x, y: onscreen.y },
    { visible: true, offscreen: false, direction: 'onscreen', x: 640, y: 360 },
  );
});

// Minimal DOM stand-in: just enough surface for the DOM-guarded HUD to run headless.
function makeFakeDom() {
  const byId = new Map();
  function el(tag) {
    const classes = new Set();
    const e = {
      tagName: tag, id: '', className: '', style: {}, textContent: '', children: [],
      isConnected: true, parentNode: null, attrs: {},
      classList: {
        toggle(name, force) {
          const on = force === undefined ? !classes.has(name) : !!force;
          if (on) classes.add(name); else classes.delete(name);
          return on;
        },
        contains: (name) => classes.has(name),
      },
      setAttribute(name, v) { e.attrs[name] = v; },
      appendChild(child) { child.parentNode = e; e.children.push(child); if (child.id) byId.set(child.id, child); return child; },
      removeChild(child) { e.children = e.children.filter((c) => c !== child); child.parentNode = null; },
    };
    return e;
  }
  const host = el('div');
  host.id = 'hud';
  byId.set('hud', host);
  return {
    host,
    doc: {
      getElementById: (id) => byId.get(id) || null,
      createElement: (tag) => el(tag),
      head: null,
      body: host,
      documentElement: null,
    },
  };
}

test('presentation: HUD seconds are the primary timing channel; state never color-only', () => {
  const t = boot(9117);
  const { doc } = makeFakeDom();
  const hud = Object.create(massSeedHud);
  const previousDocument = globalThis.document;
  globalThis.document = doc;
  try {
    // Headless guard first: with no document at all, update is a strict no-op.
    globalThis.document = undefined;
    assert.doesNotThrow(() => hud.update(DT, t.state), 'DOM-guarded headless no-op');
    globalThis.document = doc;

    hud.init({ state: t.state, helpers: { worldToScreen: () => ({ x: 640, y: 360 }) } });
    deployNow(t);
    hud.update(DT, t.state);
    const dom = hud._dom;
    assert(dom, 'DOM built under the fake document');

    // Travel: pill carries the lock countdown as TEXT; the world marker shows the future lock.
    assert(/^SEED → LOCK \d+\.\ds$/.test(dom.pillText.textContent), `travel pill has seconds: "${dom.pillText.textContent}"`);
    assert.equal(dom.pill.attrs['aria-label'], dom.pillText.textContent, 'aria channel mirrors the text');
    assert.equal(dom.mark.style.display, 'block', 'lock marker visible during travel');
    assert(/^LOCK \d+\.\ds$/.test(dom.markLabel.textContent), `marker label has seconds: "${dom.markLabel.textContent}"`);

    // A behind-camera projection can point to the wrong screen edge. The live marker uses the
    // seed/player world bearing instead, and carries the direction in text plus the ARIA channel.
    hud.helpers.worldToScreen = () => ({ x: 1520, y: 450, onScreen: false });
    hud.update(DT, t.state);
    assert.equal(dom.mark.attrs['data-direction'], 'left');
    assert.equal(dom.mark.classList.contains('mseed-offscreen'), true);
    assert.match(dom.markLabel.textContent, /· LEFT$/);
    assert.match(dom.mark.attrs['aria-label'], /offscreen left/);
    assert.match(dom.mark.style.transform, /^translate3d\(24px,/);

    // Locking: state readout stays textual.
    assert(runUntil(t, () => t.state.massSeed.phase === 'locking', TICKS.travel + 4));
    hud.update(DT, t.state);
    assert(/FRAME LOCK/.test(dom.pillText.textContent));

    // Active: countdown text, NOT the warning class.
    assert(runUntil(t, () => t.state.massSeed.phase === 'active', TICKS.locking + 4));
    hud.update(DT, t.state);
    assert(/^ANCHOR \d+s$/.test(dom.pillText.textContent), `active pill has seconds: "${dom.pillText.textContent}"`);
    assert.equal(dom.pill.classList.contains('mseed-warning'), false, 'no warning styling while healthy');
    assert.equal(dom.mark.style.display, 'none', 'lock marker retires once the anchor exists');

    // Warning: text says COLLAPSE IN n s — readable without color; class only reinforces.
    assert(runUntil(t, () => t.state.massSeed.phase === 'warning', TICKS.anchor - TICKS.warning + 30));
    hud.update(DT, t.state);
    assert(/^ANCHOR COLLAPSE IN \d+s$/.test(dom.pillText.textContent), `warning pill has seconds: "${dom.pillText.textContent}"`);
    assert.equal(dom.pill.classList.contains('mseed-warning'), true, 'warning class reinforces (not primary)');

    // Collapse → cooldown: the recharge is textual too.
    assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.warning + TICKS.collapse + 30));
    hud.update(DT, t.state);
    assert(/^SEED READY IN \d+s$/.test(dom.pillText.textContent), `cooldown pill has seconds: "${dom.pillText.textContent}"`);
    assert.equal(dom.pill.classList.contains('mseed-cooldown'), true);

    // Reduced motion: the root picks up the reduced class; timing stays textual (never motion-only).
    t.state.settings.video = { ...(t.state.settings.video || {}), motionReduce: true };
    hud.update(DT, t.state);
    assert.equal(dom.root.classList.contains('mseed-reduced-motion'), true, 'reduced-motion class applied');
    t.state.settings.video.motionReduce = false;
    hud.update(DT, t.state);
    assert.equal(dom.root.classList.contains('mseed-reduced-motion'), false);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('presentation: anchor visual is a phase-driven frame device (not an orb); resources pooled', () => {
  const factory = createVisualFactory();
  const entity = { type: 'massSeed', radius: 7, data: { massSeedState: { phase: 'travel' } } };
  const g = factory.build(entity);
  assert(g, 'massSeed visual builds');

  let meshCount = 0;
  g.traverse((o) => { if (o.isMesh) meshCount++; });
  assert.equal(meshCount, 12, 'bounded mesh set: core + gyro + 4 struts + 3 pylons + beacon + 2 chevrons');
  const beacon = g.getObjectByName('MassSeedStatusBeacon');
  const strut = g.getObjectByName('MassSeedFrameStrut_1');
  const chevrons = [];
  g.traverse((o) => { if (o.name === 'MassSeedTravelChevron') chevrons.push(o); });
  assert(beacon && strut && chevrons.length === 2, 'named parts present');
  const strutRadius = () => Math.hypot(strut.position.x, strut.position.z);

  // Travel: struts folded, travel chevrons lit, beacon dim.
  g.userData.updateRuntimeState(entity, 0);
  assert(chevrons.every((c) => c.visible), 'chevrons show the trajectory in flight');
  assert.equal(beacon.material.name, 'MassSeedBeaconDim');
  const folded = strutRadius();

  // Active (after the deploy ease completes): struts extended — silhouette IS the state readout.
  entity.data.massSeedState.phase = 'active';
  g.userData.updateRuntimeState(entity, 10);
  g.userData.updateRuntimeState(entity, 11);
  assert.equal(beacon.material.name, 'MassSeedBeaconActive');
  const activeBeaconMaterial = beacon.material;
  const deployed = strutRadius();
  assert(deployed > folded + 0.2, `struts deploy outward on lock (${folded.toFixed(2)} → ${deployed.toFixed(2)})`);
  assert(chevrons.every((c) => !c.visible), 'chevrons retire once anchored');

  // Warning: half-retracted struts + warning beacon (redundant with the HUD seconds, not primary).
  entity.data.massSeedState.phase = 'warning';
  g.userData.updateRuntimeState(entity, 12);
  g.userData.updateRuntimeState(entity, 13);
  assert.equal(beacon.material.name, 'MassSeedBeaconWarning');
  const retracting = strutRadius();
  assert(retracting < deployed && retracting > folded, 'warning pose sits between folded and deployed');
  assert(beacon.scale.x > 1.2, 'beacon scale reinforces the warning');

  // Collapsing: folds shut again, no travel cues.
  entity.data.massSeedState.phase = 'collapsing';
  g.userData.updateRuntimeState(entity, 14);
  assert(Math.abs(strutRadius() - folded) < 1e-9, 'collapse folds the frame shut');
  assert(chevrons.every((c) => !c.visible));

  // Pooled resources: a second build shares the same cached materials (no per-build allocation).
  const g2 = factory.build(entity);
  entity.data.massSeedState.phase = 'active';
  const beacon2 = g2.getObjectByName('MassSeedStatusBeacon');
  g2.userData.updateRuntimeState(entity, 20);
  g2.userData.updateRuntimeState(entity, 21);
  assert.equal(beacon2.material, activeBeaconMaterial, 'materials pooled across builds');
  assert.equal(g2.getObjectByName('MassSeedContainmentCore').geometry, g.getObjectByName('MassSeedContainmentCore').geometry,
    'geometry pooled across builds');
});

// ── 18. bounded allocations/entity counts ─────────────────────────────────────────────────
test('bounded: repeat lifecycles + replacement spam leave entities/listeners/VFX/mirror flat', () => {
  const rawBus = createBus();
  let onCalls = 0;
  const origOn = rawBus.on.bind(rawBus);
  rawBus.on = (...args) => { onCalls++; return origOn(...args); };
  const t = boot(9118, { bus: rawBus });
  const listenerTotal = () => [...rawBus._listeners.values()].reduce((n, s) => n + s.size, 0);
  const baseEntities = t.state.entityList.length;
  const baseListeners = listenerTotal();
  const baseOnCalls = onCalls;

  // Three full lifecycles back to back.
  for (let cycle = 0; cycle < 3; cycle++) {
    deployNow(t);
    assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.travel + TICKS.anchor + TICKS.collapse + 30),
      `cycle ${cycle} completes`);
    t.state.player.massSeed.cooldownUntil = 0; // stand-in for waiting out the 8s cooldown
  }
  assert.equal(t.state.entityList.length, baseEntities, 'entity count returns to baseline each cycle');
  assert.equal(listenerTotal(), baseListeners, 'no listener growth');
  assert.equal(onCalls, baseOnCalls, 'no new subscriptions after init');
  assert.equal(eventsNamed(t, 'presentation:vfxCue').length, 6, 'exactly frameLock + collapse per lifecycle');
  assert.equal(t.state.massSeed.dying.length, 0, 'dying slot drained');
  assert.equal(Object.keys(t.state.combat.attachments.byId).length, 0, 'no attachment ledger growth (never latched)');
  assert(JSON.stringify(t.state.massSeed).length < 600, 'mirror stays a small flat record');

  // Replacement spam (a press every 3rd tick): the dying cap holds; a lifecycle clear flushes all.
  for (let i = 0; i < 24; i++) {
    if (t.state.tick % 3 === 0) {
      t.state.input.aimWorld = { x: 500, z: 0 };
      t.state.input.actions.deployMassSeed = true;
    }
    t.sim.step();
    assert(t.state.massSeed.dying.length <= 8, `dying cap holds (got ${t.state.massSeed.dying.length})`);
  }
  t.bus.emit('sector:exit', { sectorId: 'sector_spam' });
  for (let i = 0; i < 4; i++) t.sim.step();
  assert.equal(t.state.massSeed.dying.length, 0, 'lifecycle clear flushes retired seeds');
  assert.equal(t.state.entityList.length, baseEntities, 'spam leaves zero seed entities behind');
  assert.equal(listenerTotal(), baseListeners, 'still no listener growth after spam');
});

// ── 19. regression: acquirable under an ACTIVE spatial hash ───────────────────────────────
// The hash's STATIC layer caches positions by version: a kinematic static would stay bucketed at
// its spawn point forever, and latch queries near the lock point would never see it. The seed is
// classed movable (dynamic spatial layer, prevPos snapshots) precisely so its membership follows
// entity.pos. This test forces the hash active (≥96 collidables) and queries both points.
test('regression: locked seed is bucketed at its lock point under an active spatial hash', async () => {
  const t = await bootPhysics(9219);
  try {
    for (let i = 0; i < 100; i++) {
      const a = (i / 100) * Math.PI * 2;
      t.sim.spawn({
        type: 'asteroid',
        pos: { x: 4000 + Math.cos(a) * 800, z: Math.sin(a) * 800 },
        radius: 20, mass: 4000, collides: true, data: {},
      });
    }
    deployNow(t);
    assert(runUntil(t, () => t.state.massSeed.phase === 'active', TICKS.travel + TICKS.locking + 4), 'seed anchors');
    t.sim.step(); // physics maintains the layered hash past the collidable threshold
    assert(hasActiveSpatialHash(t.state.spatialHash), 'hash active past the collidable threshold');

    const lockPos = t.state.massSeed.lockPos;
    const nearLock = t.helpers.queryRadius({ x: lockPos.x, z: lockPos.z }, 30, []);
    assert(nearLock.some((e) => e.type === 'massSeed'),
      'seed is found at its LOCK point (a static-layer ghost would still sit at spawn)');
    const nearSpawn = t.helpers.queryRadius({ x: SPAWN_OFFSET, z: 0 }, 30, []);
    assert(!nearSpawn.some((e) => e.type === 'massSeed'), 'no stale bucket left at the spawn point');

    // And the production acquisition path agrees: preview at the lock point selects the seed.
    teleportPlayer(t, lockPos.x - 38, lockPos.z);
    assert(runUntil(t, () => {
      const sel = t.state.masslineAcquisition && t.state.masslineAcquisition.selected;
      return sel && sel.targetId === t.state.massSeed.seedId;
    }, 40), 'receipt selects the seed at its lock point under the active hash');
  } finally {
    t.cleanup();
  }
});
