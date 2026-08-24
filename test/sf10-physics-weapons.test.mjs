// SF-10 (PQ-010) — physics-first weapon vertical slice contracts.
//
// Covers the three new families end to end at the headless contract level, building on the PQ-009
// substrate (impulse kernel + physics authority + provenance) rather than duplicating it:
//   * per-family impulse/consequence identity (concussion / vector mine / RCS disruptor),
//   * the light-tier "mass-response" rebalance (a light hull is thrown into a tumble, a heavy hull
//     shrugs the same shove — the weapon is the rebalance lever, not an HP nerf),
//   * the vector-mine DEPLOY verb lifecycle (arm → proximity → radial impulse incl. the owner, zero
//     hull damage) routed through the physics authority,
//   * the RCS disruptor's bounded turn-authority suppression window (a last-writer control override,
//     no new status framework), triggered off the provenance the hit leaves,
//   * VFX identity + immutable-profile pooling for the three families.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import {
  resolveWeaponImpulseForHit,
  resolveCollisionConsequence,
  recordImpulseProvenance,
  readRecentImpulseProvenance,
  readRecentImpulseProvenanceHistory,
  clearImpulseProvenance,
  COLLISION_CONSEQUENCE_LIMITS,
} from '../src/combat/impulseKernel.js';
import { consumePhysicsCommand, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { weapons } from '../src/systems/weapons.js';
import {
  resolveWeaponPresentationFamily,
  resolveImpactPresentationProfile,
  resolveProjectileTrailProfile,
} from '../src/render/vfxProfiles.js';

const BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const CONCUSSION = BY_ID.get('wpn_concussion_cannon_m');
const VECTOR_MINE = BY_ID.get('wpn_vector_mine_m');
const RCS = BY_ID.get('wpn_rcs_disruptor_m');

// Canonical light-tier enemy masses (src/data/ships.js): Wasp 16, Hornet 24. Heavies are 150+.
const LIGHT_MASS = 16;
const HEAVY_MASS = 150;

test('the three SF-10 families exist and declare distinct physics-first identity', () => {
  for (const w of [CONCUSSION, VECTOR_MINE, RCS]) {
    assert.ok(w, 'each SF-10 family must be a shipped weapon def');
    assert.ok(Number.isFinite(w.impulsePerHit) && w.impulsePerHit > 0, `${w.id} needs positive impulsePerHit`);
    assert.ok(Number.isFinite(w.tumbleTorque) && w.tumbleTorque >= 0, `${w.id} needs finite tumbleTorque`);
    assert.match(String(w.impulseProvenance || ''), /^[a-z0-9_]+$/, `${w.id} needs a stable provenance tag`);
    assert.ok(w.price > 0, `${w.id} must be acquirable (price>0 → outfitting shop)`);
  }
  const tags = new Set([CONCUSSION.impulseProvenance, VECTOR_MINE.impulseProvenance, RCS.impulseProvenance]);
  assert.equal(tags.size, 3, 'the three families must not collapse onto one impulse identity');

  // Concussion is a momentum weapon, not a DPS gun (STEP 9 forbidden shortcut #1): huge impulse,
  // low damage, far more shove-per-damage than any conventional slug.
  assert.ok(CONCUSSION.impulsePerHit > BY_ID.get('wpn_autocannon_m').impulsePerHit * 5,
    'concussion trades damage for momentum — a much heavier shove than a DPS autocannon');
  assert.ok(CONCUSSION.dmg <= BY_ID.get('wpn_autocannon_s').dmg,
    'concussion damage stays low — the kill comes from terrain, not the gun');
  assert.ok(CONCUSSION.impulsePerHit <= BY_ID.get('wpn_siege_lance_l').impulsePerHit,
    'a mid slot must not out-shove the capital siege lance');

  // Vector mine throws, it does not burn: zero authored hull damage (design Q9).
  assert.equal(VECTOR_MINE.dmg, 0, 'vector mine must deal zero hull damage — it is pure impulse');
  assert.ok(VECTOR_MINE.energyCost > 0 && VECTOR_MINE.heatPerShot > 0,
    'vector mine cost is paid in capacitor + heat, not damage');
  assert.equal(VECTOR_MINE.tracking, 'deploy', 'vector mine uses the deploy fire verb');

  // RCS disruptor is a disable verb: low hull damage, couples through shields to subsystems.
  assert.ok(RCS.dmg < BY_ID.get('wpn_emp_disruptor_m').dmg, 'RCS disruptor is a disable, not a killer');
  assert.equal(RCS.shieldBypass, 1.0, 'RCS disruptor couples through shields like the EMP family');
  assert.ok(RCS.subsystemShare > 0.5, 'RCS disruptor routes to subsystems');
  assert.ok(RCS.rcsDisruptS > 0, 'RCS disruptor declares a bounded suppression window');
});

test('light-tier mass-response: the concussion cannon tumbles a light hull but a heavy hull shrugs it', () => {
  // The applied impulse identity at a full authored hit is the weapon impulsePerHit.
  const identity = resolveWeaponImpulseForHit(CONCUSSION, CONCUSSION.dmg);
  assert.ok(identity && identity.magnitude > 0, 'a full concussion hit resolves a positive impulse');

  // Δv from the weapon shove alone (impulse / mass): a light hull is picked up hard, a heavy barely moves.
  const lightDeltaV = identity.magnitude / LIGHT_MASS;
  const heavyDeltaV = identity.magnitude / HEAVY_MASS;
  assert.ok(lightDeltaV >= COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV,
    `a light hull's Δv (${lightDeltaV.toFixed(1)}) must clear the tumble threshold (${COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV})`);
  assert.ok(heavyDeltaV < COLLISION_CONSEQUENCE_LIMITS.staggerDeltaV,
    `a heavy hull's Δv (${heavyDeltaV.toFixed(1)}) must stay below the stagger threshold (${COLLISION_CONSEQUENCE_LIMITS.staggerDeltaV})`);

  // 2026-08-21 (b9858f1d): environment contacts never steal the helm, even with a fresh
  // weapon-impulse tag. Terrain still receipts damage; helm loss is craft-on-craft (and
  // direct weapon torque), not the wall slam. Mass-response still distinguishes light/heavy.
  const exchanged = identity.magnitude; // p = m·Δv; the thrown hull dumps ~its full momentum into the wall
  const common = { other: { id: 9, type: 'asteroid' }, exchangedMomentum: exchanged, tick: 100,
    pos: { x: 0, z: 0 }, normal: { x: -1, z: 0 },
    provenance: { actorId: 1, weaponId: CONCUSSION.id, tag: CONCUSSION.impulseProvenance, appliedTick: 98 } };
  const lightHit = resolveCollisionConsequence({ ...common, target: { id: 2, type: 'ship', mass: LIGHT_MASS, radius: 6 } });
  const heavyHit = resolveCollisionConsequence({ ...common, target: { id: 3, type: 'ship', mass: HEAVY_MASS, radius: 16 } });
  assert.equal(lightHit.control, 'none',
    'a terrain slam must not tumble, even with concussion provenance on the victim');
  assert.ok(lightHit.impactDamage > 0, 'the light-hull wall impact is a receipted terrain-damage event');
  assert.equal(heavyHit.control, 'none', 'a heavy hull is not tumbled by the same terrain slam');

  const craftCommon = { ...common, other: { id: 8, type: 'ship', mass: 20, radius: 6 } };
  const lightCraft = resolveCollisionConsequence({
    ...craftCommon, target: { id: 12, type: 'ship', mass: LIGHT_MASS, radius: 6 },
  });
  const heavyCraft = resolveCollisionConsequence({
    ...craftCommon, target: { id: 13, type: 'ship', mass: HEAVY_MASS, radius: 16 },
  });
  assert.equal(lightCraft.control, 'tumble',
    'the same concussion momentum still tumbles a light hull on craft contact');
  assert.notEqual(heavyCraft.control, 'tumble',
    'a heavy hull shrugs the same craft-contact shove');
});

// --- vector-mine DEPLOY lifecycle -------------------------------------------------------------

function makeWeaponsHost(entities, { seed = 47 } = {}) {
  const emitted = [];
  const applied = [];
  const routed = [];
  const state = {
    mode: 'flight', tick: 600, simTime: 10, playerId: 1,
    entities: new Map(entities.map((e) => [e.id, e])),
    entityList: entities.slice(),
    combat: { beams: [], threatTables: new Map() },
    input: { fire: false, actions: {} },
    meta: { seed },
  };
  let nextId = 1000;
  const helpers = {
    mulberry32: () => () => 0.5,
    hash32: () => 1,
    getEntity: (id) => state.entities.get(id) || null,
    spawnEntity: (spec) => {
      const e = { id: nextId++, alive: true, vel: { x: 0, z: 0 }, rot: 0, ...spec };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      return e;
    },
    combatPhysics: {
      applyImpulse: (input) => { applied.push(input); return true; },
      applyTorqueImpulse: (input) => { applied.push({ ...input, torque: true }); return true; },
    },
    routeCombatDamage: (req) => { routed.push(req); return { ok: true }; },
  };
  // weapons.init now subscribes (lab refill, attack-hit, sector enter). The host
  // only needs on() to exist; this test records emit() receipts, not those events.
  const bus = {
    emit: (name, payload) => emitted.push({ name, payload }),
    on: () => {},
  };
  const host = Object.create(weapons);
  host.init({ state, bus, helpers, registry: { get: () => null } });
  return { host, state, emitted, applied, routed, helpers };
}

test('impulse provenance history stays bounded and clearable while the compatibility reader remains latest-only', () => {
  const entity = { id: 91, data: {} };
  let latest = null;
  for (let i = 0; i < 32; i++) {
    const def = i === 0 ? CONCUSSION : BY_ID.get('wpn_autocannon_m');
    latest = recordImpulseProvenance(entity, {
      actorId: 1, weaponId: def.id, tag: def.impulseProvenance,
      appliedTick: 700 + i, magnitude: def.impulsePerHit,
    });
  }

  assert.strictEqual(readRecentImpulseProvenance(entity, 731), latest,
    'the compatibility reader still returns exactly the latest record');
  const history = readRecentImpulseProvenanceHistory(entity, 731);
  assert.equal(history.length, 16, 'transient provenance history has a small hard cap');
  assert.strictEqual(history.at(-1), latest, 'bounded history retains the compatibility/latest record');
  assert.ok(Object.isFrozen(history), 'consumers cannot mutate the shared transient history');
  assert.deepEqual(entity, { id: 91, data: {} }, 'history never leaks into the serialized entity graph');

  clearImpulseProvenance(entity);
  assert.equal(readRecentImpulseProvenance(entity, 731), null, 'explicit clear preserves latest-reader semantics');
  assert.deepEqual(readRecentImpulseProvenanceHistory(entity, 731), [], 'explicit clear removes history too');
});

test('concussion cannon: a fresh direct hit briefly blocks NPC counterthrust without touching velocity or player control', () => {
  const prev = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try {
    assert.ok(Number.isFinite(CONCUSSION.npcCounterthrustDelayS) && CONCUSSION.npcCounterthrustDelayS > 0,
      'concussion authors its NPC counterthrust delay in weapon data');
    assert.ok(CONCUSSION.npcCounterthrustDelayS < RCS.rcsDisruptS,
      'concussion recovery is a short displacement beat, not a second RCS disable');

    const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, data: {} };
    const enemy = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 40, z: 0 }, vel: { x: 25, z: -4 }, rot: 0, radius: 6, data: { intent: { thrust: 1, strafe: -1 } } };
    const otherEnemy = { id: 3, type: 'ship', alive: true, team: 1, pos: { x: 80, z: 0 }, vel: { x: 2, z: 0 }, rot: 0, radius: 6, data: { intent: { thrust: 1 } } };
    const { host, state } = makeWeaponsHost([player, enemy, otherEnemy]);
    state.entityIndex = { ships: [player, enemy, otherEnemy] };
    const velocityAfterHit = { ...enemy.vel };
    const intentAfterHit = { ...enemy.data.intent };
    const hitTick = state.tick;
    const autocannon = BY_ID.get('wpn_autocannon_m');

    // This is the production receipt damage.js leaves after applying the Concussion impulse.
    recordImpulseProvenance(enemy, {
      actorId: player.id, weaponId: CONCUSSION.id, tag: CONCUSSION.impulseProvenance,
      appliedTick: hitTick, magnitude: CONCUSSION.impulsePerHit,
    });
    // A later impulse-bearing hit in the same combat tick becomes the compatibility/latest record,
    // but must not erase the Concussion receipt used by the recovery layer.
    const overwrittenLatest = recordImpulseProvenance(enemy, {
      actorId: player.id, weaponId: autocannon.id, tag: autocannon.impulseProvenance,
      appliedTick: hitTick, magnitude: autocannon.impulsePerHit,
    });
    assert.strictEqual(readRecentImpulseProvenance(enemy, hitTick), overwrittenLatest,
      'collision/presentation compatibility readers still see the latest Autocannon receipt');
    assert.deepEqual(
      readRecentImpulseProvenanceHistory(enemy, hitTick).map((record) => record.weaponId),
      [CONCUSSION.id, autocannon.id],
      'recovery history retains Concussion even after a later same-tick impulse hit',
    );
    // A Concussion hit on the player must never enter the NPC recovery lane.
    recordImpulseProvenance(player, {
      actorId: otherEnemy.id, weaponId: CONCUSSION.id, tag: CONCUSSION.impulseProvenance,
      appliedTick: hitTick, magnitude: CONCUSSION.impulsePerHit,
    });
    // An ordinary weapon receipt must leave another NPC's controls unchanged.
    recordImpulseProvenance(otherEnemy, {
      actorId: player.id, weaponId: autocannon.id, tag: autocannon.impulseProvenance,
      appliedTick: hitTick, magnitude: autocannon.impulsePerHit,
    });

    state.tick = hitTick + 1;
    writePhysicsControl(enemy, {
      mode: 'ai', force: { x: -900, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 12 }, source: 'aiPorts',
    });
    writePhysicsControl(player, {
      mode: 'player', force: { x: 400, y: 0, z: 0 }, torque: { x: 0, y: 0, z: -5 }, source: 'flight',
    });
    writePhysicsControl(otherEnemy, {
      mode: 'ai', force: { x: -300, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 4 }, source: 'aiPorts',
    });
    host._tickNpcCounterthrustRecovery(state);
    const cmd = consumePhysicsCommand(enemy);
    assert.ok(cmd && cmd.control, 'a freshly hit NPC receives a post-AI control override');
    assert.equal(cmd.control.mode, 'concussion_recovery', 'the override identifies the short Concussion recovery beat');
    assert.deepEqual(cmd.control.force, { x: 0, y: 0, z: 0 }, 'AI cannot immediately counterthrust the displacement');
    assert.deepEqual(enemy.vel, velocityAfterHit, 'the recovery layer never rewrites the impulse-authored velocity');
    assert.equal(consumePhysicsCommand(player).control.mode, 'player', 'Concussion recovery never overrides player control');
    assert.equal(consumePhysicsCommand(otherEnemy).control.mode, 'ai', 'other weapons leave NPC control unchanged');

    const windowTicks = Math.round(CONCUSSION.npcCounterthrustDelayS * 60);
    const retriggerTick = hitTick + Math.floor(windowTicks / 2);
    state.tick = retriggerTick;
    recordImpulseProvenance(enemy, {
      actorId: player.id, weaponId: CONCUSSION.id, tag: CONCUSSION.impulseProvenance,
      appliedTick: retriggerTick, magnitude: CONCUSSION.impulsePerHit,
    });
    writePhysicsControl(enemy, {
      mode: 'ai_retrigger', force: { x: -720, y: 0, z: 20 }, torque: { x: 0, y: 0, z: 6 }, source: 'aiPorts',
    });
    host._tickNpcCounterthrustRecovery(state);
    assert.equal(consumePhysicsCommand(enemy).control.mode, 'concussion_recovery', 'a later Concussion hit retriggers recovery from its own tick');

    state.tick = hitTick + windowTicks + 1;
    writePhysicsControl(enemy, {
      mode: 'ai_old_expiry', force: { x: -690, y: 0, z: 55 }, torque: { x: 0, y: 0, z: 7 }, source: 'aiPorts',
    });
    host._tickNpcCounterthrustRecovery(state);
    assert.equal(consumePhysicsCommand(enemy).control.mode, 'concussion_recovery',
      'the later hit extends recovery beyond the first hit\'s exact expiry');

    const extendedUntil = retriggerTick + windowTicks;
    state.tick = extendedUntil;
    writePhysicsControl(enemy, {
      mode: 'ai_boundary', force: { x: -650, y: 0, z: 75 }, torque: { x: 0, y: 0, z: 8 }, source: 'aiPorts',
    });
    host._tickNpcCounterthrustRecovery(state);
    const boundaryCmd = consumePhysicsCommand(enemy);
    assert.equal(boundaryCmd.control.mode, 'concussion_recovery', 'the final authored recovery tick still overrides AI control');
    assert.deepEqual(boundaryCmd.control.force, { x: 0, y: 0, z: 0 }, 'counterthrust remains blocked at the exact inclusive boundary');

    state.tick = extendedUntil + 1;
    const resumedAiControl = writePhysicsControl(enemy, {
      mode: 'ai_recovered', force: { x: -321, y: 0, z: 45 }, torque: { x: 0, y: 0, z: -7 }, source: 'aiPorts_after_recovery',
    });
    host._tickNpcCounterthrustRecovery(state);
    assert.deepEqual(consumePhysicsCommand(enemy).control, resumedAiControl,
      'the first tick after recovery preserves the distinct AI command intact');
    assert.deepEqual(enemy.vel, velocityAfterHit, 'boundary handling never rewrites velocity');
    assert.deepEqual(enemy.data.intent, intentAfterHit, 'boundary handling never mutates AI-owned intent');
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = prev;
  }
});

test('Concussion counterthrust recovery is a strict no-op when weapon impulse consequences are pinned OFF', () => {
  const prev = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = false;
  try {
    const enemy = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 40, z: 0 }, vel: { x: 25, z: 0 }, rot: 0, radius: 6, data: {} };
    const { host, state } = makeWeaponsHost([
      { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, data: {} },
      enemy,
    ]);
    state.entityIndex = { ships: [enemy] };
    recordImpulseProvenance(enemy, {
      actorId: 1, weaponId: CONCUSSION.id, tag: CONCUSSION.impulseProvenance,
      appliedTick: state.tick, magnitude: CONCUSSION.impulsePerHit,
    });
    host._tickNpcCounterthrustRecovery(state);
    assert.equal(consumePhysicsCommand(enemy), null, 'flag OFF preserves the frozen simulation path');
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = prev;
  }
});

test('vector mine: deploy spends cap/heat and drops an armable mine behind the ship', () => {
  const prev = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try {
    const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, cap: 100, data: {} };
    const { host, state, emitted } = makeWeaponsHost([player]);
    const w = { defId: VECTOR_MINE.id, slotIndex: 0, _cooldown: 0, _heat: 0 };
    const capAfter = host._serviceDeployWeapon(player, w, VECTOR_MINE, true, 100, state, 0);

    assert.ok(capAfter < 100, 'deploy spends capacitor');
    assert.ok(w._heat > 0, 'deploy adds heat');
    assert.ok(w._cooldown > 0, 'deploy sets a cooldown');
    const mine = state.entityList.find((e) => e.type === 'vectormine');
    assert.ok(mine, 'a vectormine entity is deployed');
    assert.equal(mine.data.armed, false, 'the mine starts un-armed (arm delay protects the deployer)');
    assert.equal(mine.collides, false, 'the mine is a logical trigger volume, not a physics body');
    // Behind the heading (rot 0 → behind is -x).
    assert.ok(mine.pos.x < 0, 'the mine deploys behind the ship');
    assert.ok(emitted.some((ev) => ev.name === 'weapons:mineDeployed'), 'deploy is receipted on the bus');
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = prev;
  }
});

test('vector mine: arms after its delay, then a proximity trigger shoves every hull in the blast — including the owner — with zero hull damage', () => {
  const prev = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try {
    const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, cap: 100, data: {} };
    const enemy = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, mass: LIGHT_MASS, data: {} };
    const { host, state, emitted, applied, routed } = makeWeaponsHost([player, enemy]);
    const w = { defId: VECTOR_MINE.id, slotIndex: 0, _cooldown: 0, _heat: 0 };
    host._serviceDeployWeapon(player, w, VECTOR_MINE, true, 100, state, 0);
    const mine = state.entityList.find((e) => e.type === 'vectormine');
    const minePos = { x: mine.pos.x, z: mine.pos.z };

    // Before arming: even a hull sitting on the mine does not trigger it.
    enemy.pos = { x: minePos.x + 5, z: minePos.z };
    host._tickVectorMines(1 / 60, state);
    assert.equal(mine.alive, true, 'an un-armed mine never triggers');
    assert.equal(applied.length, 0, 'no impulse before arming');

    // Advance past the arm delay → the mine arms (no trigger yet: move the enemy away first).
    enemy.pos = { x: 900, z: 0 };
    state.simTime = mine.data.armAt + 0.1;
    host._tickVectorMines(1 / 60, state);
    assert.equal(mine.data.armed, true, 'the mine arms after its delay');
    assert.equal(mine.alive, true, 'arming alone does not detonate');
    assert.ok(emitted.some((ev) => ev.name === 'weapons:mineArmed'), 'arming is receipted');

    // Bring an enemy into the trigger radius → detonation shoves BOTH the enemy and the nearby owner.
    player.pos = { x: minePos.x - 20, z: minePos.z }; // owner within blastRadius (150) for self-boost
    enemy.pos = { x: minePos.x + (VECTOR_MINE.mineTriggerRadius - 5), z: minePos.z };
    host._tickVectorMines(1 / 60, state);
    assert.equal(mine.alive, false, 'a hull inside the trigger radius detonates the mine');
    const shovedIds = new Set(applied.map((a) => a.entityId));
    assert.ok(shovedIds.has(enemy.id), 'the triggering enemy is shoved');
    assert.ok(shovedIds.has(player.id), 'the owner is shoved too — blast-yourself mobility');
    for (const a of applied) {
      assert.equal(a.reason, 'vector_mine', 'the shove is a vector-mine physics-authority request');
      assert.ok(Number.isFinite(a.impulse.x) && Number.isFinite(a.impulse.z), 'finite impulse vector');
    }
    assert.equal(routed.length, 0, 'the mine deals ZERO hull damage — it never routes a damage packet');
    assert.ok(emitted.some((ev) => ev.name === 'weapons:mineDetonated'), 'detonation is receipted');
    assert.ok(emitted.some((ev) => ev.name === 'presentation:vfxCue' && ev.payload.id === 'combat.vectorMine.detonate'),
      'detonation emits its own distinct presentation cue');
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = prev;
  }
});

// --- RCS disruptor suppression window ---------------------------------------------------------

test('RCS disruptor: a hit latches a bounded turn-authority override on an NPC, then releases it', () => {
  const prev = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try {
    const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, data: {} };
    const enemy = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 40, z: 0 }, vel: { x: 3, z: 0 }, rot: 0, radius: 6, data: { intent: { fire: true, aimAngle: 0 } } };
    const { host, state, emitted } = makeWeaponsHost([player, enemy]);
    state.entityIndex = { ships: [player, enemy] };

    // Simulate the disruptor hit leaving its PQ-009 provenance on the target (what damage.js does on
    // an impulse-bearing hit when the flag is live).
    const hitTick = state.tick;
    recordImpulseProvenance(enemy, { actorId: player.id, weaponId: RCS.id, tag: RCS.impulseProvenance, appliedTick: hitTick, magnitude: RCS.impulsePerHit });

    // The tick after the hit: weapons latches the window and writes a control override.
    state.tick = hitTick + 1;
    host._tickRcsDisruption(state);
    const cmd = consumePhysicsCommand(enemy);
    assert.ok(cmd && cmd.control, 'a disrupted NPC receives a physics-control command');
    assert.equal(cmd.control.mode, 'rcs_disrupted', 'the override is the RCS-disrupt mode');
    assert.deepEqual(cmd.control.force, { x: 0, y: 0, z: 0 }, 'no thrust while disrupted (attitude drift)');
    assert.deepEqual(cmd.control.torque, { x: 0, y: 0, z: 0 }, 'no steering torque while disrupted');
    assert.equal(consumePhysicsCommand(player), null, 'the firing player is never disrupted');
    assert.ok(emitted.some((ev) => ev.name === 'presentation:vfxCue' && ev.payload.id === 'ship.rcsDisrupt'),
      'the disable emits its own sparking cue, distinct from the tumble cue');

    // Mid-window: still suppressed.
    const windowTicks = Math.round(RCS.rcsDisruptS * 60);
    state.tick = hitTick + Math.floor(windowTicks / 2);
    host._tickRcsDisruption(state);
    assert.equal(consumePhysicsCommand(enemy).control.mode, 'rcs_disrupted', 'the override holds through the window');

    // After the window: the latch releases and the NPC regains control (no override written).
    state.tick = hitTick + windowTicks + 5;
    host._tickRcsDisruption(state);
    assert.equal(consumePhysicsCommand(enemy), null, 'the override expires — control is bounded, not permanent');
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = prev;
  }
});

test('RCS disruption is a strict no-op when weapon impulse consequences are pinned OFF (golden-safe)', () => {
  const prev = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = false;
  try {
    const enemy = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, data: {} };
    const { host, state } = makeWeaponsHost([{ id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, data: {} }, enemy]);
    state.entityIndex = { ships: [enemy] };
    recordImpulseProvenance(enemy, { actorId: 1, weaponId: RCS.id, tag: RCS.impulseProvenance, appliedTick: state.tick, magnitude: RCS.impulsePerHit });
    host._tickRcsDisruption(state);
    host._tickVectorMines(1 / 60, state);
    assert.equal(consumePhysicsCommand(enemy), null, 'flag OFF → no control override, no mine tick (golden byte-stable)');
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = prev;
  }
});

// --- VFX identity + immutable-profile pooling -------------------------------------------------

test('the three families read as mechanically distinct VFX, on immutable pooled profiles', () => {
  const fams = [CONCUSSION.id, VECTOR_MINE.id, RCS.id].map((id) => resolveWeaponPresentationFamily(id).family);
  assert.deepEqual(fams, ['concussion', 'mine', 'emp'], 'three different presentation families (no shared VFX)');

  const impacts = [CONCUSSION.id, VECTOR_MINE.id, RCS.id].map((id) => resolveImpactPresentationProfile(id));
  assert.equal(new Set(impacts.map((p) => p.mode)).size, 3, 'each family owns a distinct impact mode');
  assert.ok(impacts.every((p) => p.primaryShape !== 'ring'),
    'no family relies on a generic primary ring (graphics-checkpoint reject list)');
  assert.ok(impacts.every((p) => !/ball/i.test(p.mode) && !/ball/i.test(p.primaryShape || '')),
    'no family reads as a generic ball');

  // Profiles are immutable and shared (pooling contract): resolving twice returns the SAME frozen
  // object, so per-shot presentation never allocates a fresh clone.
  const t1 = resolveProjectileTrailProfile(CONCUSSION.id);
  const t2 = resolveProjectileTrailProfile(CONCUSSION.id);
  assert.strictEqual(t1, t2, 'trail profile resolution reuses one immutable pooled object');
  assert.ok(Object.isFrozen(t1), 'trail profiles are frozen');
  assert.notEqual(resolveProjectileTrailProfile(CONCUSSION.id).class, resolveProjectileTrailProfile(RCS.id).class,
    'concussion and RCS disruptor tow structurally different wakes');
});
