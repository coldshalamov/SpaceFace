// Seed 4242, Ricochet Foundry, fresh profile.
//
// 826c active: the lesson wasp and asteroid 33000368 die on the same tick at
// sim 8.32, score stays 0, the empty cohort releases the pack ("The pack is
// inbound" by sim 8.2), and round 1 is still open at sim 300 (12/15 resolved).
// 4b3b active: the player kills that hull at sim 10.2 (score 101) and wave 1
// clears at sim 50.8. Idle 826c: the same hull dies at sim 29.9 with no input.
//
// Current master refuses survival-cohort damage until the pilot acts
// (damage.js swarm_waiting_for_input). The active failure is the hit AFTER
// the thrust probe. The headless foundry parks the rocks, so the post-act
// cases drive the live kernel with the same collision origin.
import assert from 'node:assert/strict';
import test from 'node:test';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { simulateCrucibleSwarm } from '../scripts/lib/bench/crucibleBench.mjs';

const SEED = 4242;
const ARENA = 'helios_core';
const LOADOUT = 'ricochet_runner';

function cohortShips(state) {
  const ships = [];
  const entities = state && state.entities;
  if (!entities || typeof entities.values !== 'function') return ships;
  for (const entity of entities.values()) {
    if (!entity || entity.alive === false || entity.type !== 'ship') continue;
    if (entity.id === state.playerId) continue;
    if (entity.data && entity.data.runCohort === 'survival') ships.push(entity);
  }
  return ships;
}

function asteroidAttackerId(state) {
  const entities = state && state.entities;
  if (!entities || typeof entities.values !== 'function') return null;
  for (const entity of entities.values()) {
    if (entity && entity.alive !== false && entity.type === 'asteroid') return entity.id;
  }
  return null;
}

// Same packet shape collisionConsequences._routeImpactDamage hands the kernel.
function strike(runtime, state, target, attackerId, originKind) {
  const packet = scalarHitToDamagePacket({
    damage: (Number(target.hull) || 0) + (Number(target.shield) || 0) + (Number(target.armorHp) || 0) + 4000,
    damageType: 'kinetic',
    pos: target.pos ? { x: target.pos.x, z: target.pos.z } : { x: 0, z: 0 },
    source: { kind: originKind === 'collision' ? 'collision_asteroid' : 'weapon' },
  });
  packet.flags = { allowAnyTarget: true };
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime.config.features);
  try {
    return runtime.getSystem('combat').ensureKernel().routeDamage({
      attackerId,
      targetId: target.id,
      packet,
      origin: originKind === 'collision'
        ? { kind: 'collision', id: 'asteroid' }
        : { kind: 'weapon', id: 'wpn_test', weaponId: 'wpn_test' },
    });
  } finally {
    restoreFeatureMaps(previous);
  }
}

function runSnapshot(state, wasp) {
  const run = state.run || {};
  return {
    sim: Number(state.simTime) || 0,
    phase: run.phase || null,
    spawned: run.spawnedThreat | 0,
    resolved: run.resolvedThreat | 0,
    alive: !!(wasp && wasp.alive !== false),
    hull: wasp && Number.isFinite(wasp.hull) ? wasp.hull : null,
    armorHp: wasp && Number.isFinite(wasp.armorHp) ? wasp.armorHp : null,
  };
}

function combatantRuntime(state, target) {
  const table = state && state.combat && state.combat.entities;
  return table && target ? table[target.id] : null;
}

// Leave every part short of full so a restore-to-max would be visible, and arm a destroy on
// a part this collision is not supposed to own. The plant is undone after the strike so the
// next tick does not actually disable the wasp.
function chipLessonParts(state, target) {
  const runtime = combatantRuntime(state, target);
  if (!runtime || !runtime.subsystems) return null;
  const tick = state.tick >>> 0;
  let plantedId = null;
  for (const [id, subsystem] of Object.entries(runtime.subsystems)) {
    if (!subsystem || !(subsystem.health > 8)) continue;
    subsystem.health -= 7;
    if (!plantedId && id !== 'subsystem_power') plantedId = id;
  }
  const planted = plantedId ? runtime.subsystems[plantedId] : null;
  if (planted) {
    planted.lastDamageTick = tick;
    planted.pendingTransition = { atTick: tick + 1, destroyed: true, reason: 'test-player-chip', attackerId: state.playerId };
    planted.destroyed = false;
    runtime.pendingSubsystemTransitionCount = (runtime.pendingSubsystemTransitionCount | 0) + 1;
  }
  return { plantedId, armorBefore: target.armorHp };
}

function readLessonParts(state, target, plantedId) {
  const runtime = combatantRuntime(state, target);
  const planted = runtime && plantedId ? runtime.subsystems[plantedId] : null;
  return {
    plantedId,
    plantedHealth: planted ? planted.health : null,
    plantedPending: planted && planted.pendingTransition ? planted.pendingTransition.reason : null,
    pendingCount: runtime ? (runtime.pendingSubsystemTransitionCount | 0) : null,
  };
}

function clearPlantedDestroy(state, target, plantedId) {
  const runtime = combatantRuntime(state, target);
  const planted = runtime && plantedId ? runtime.subsystems[plantedId] : null;
  if (!planted || !planted.pendingTransition || planted.pendingTransition.reason !== 'test-player-chip') return;
  planted.pendingTransition = null;
  planted.lastDamageTick = -1;
  if ((runtime.pendingSubsystemTransitionCount | 0) > 0) runtime.pendingSubsystemTransitionCount -= 1;
}

/**
 * Idle fresh-profile foundry. `when` is 'early' (lesson still held) or 'late'
 * (the 45s clock has already brought the pack). `originKind` is 'collision'
 * or 'weapon'. attacker is 'rock' or 'player'. `acted` notes this wave's
 * pilot act immediately before the strike, which is the active-run case:
 * the thrust probe has already released the damage latch.
 */
async function runLesson({ when, originKind, attacker, tickCap, inspectParts = false, acted = false }) {
  const note = {
    struck: null,
    strikeResult: null,
    after: null,
    releasedAt: null,
    missed: null,
    parts: null,
  };
  let wasp = null;
  let struckSim = null;
  await simulateCrucibleSwarm({
    arenaId: ARENA,
    loadoutId: LOADOUT,
    seed: SEED,
    waveCount: 1,
    tickCap,
    openingLesson: true,
    pilot: 'idle',
    onTick({ state, events, runtime }) {
      const run = state.run;
      if (!run) return;
      if (note.releasedAt == null) {
        for (const ev of events) {
          if (ev.ev === 'run:openingLessonReleased') note.releasedAt = state.simTime;
        }
      }
      const sim = Number(state.simTime) || 0;
      // Remember the lone lesson hull before any strike, including the late one.
      if (!wasp && run.phase === 'active' && (run.spawnedThreat | 0) === 1) {
        const ships = cohortShips(state);
        if (ships.length === 1) wasp = ships[0];
      }
      if (note.struck) {
        if (note.after == null && struckSim != null && sim >= struckSim + (when === 'late' ? 2 : 3)) {
          note.after = { ...runSnapshot(state, wasp), released: note.releasedAt != null };
        }
        return;
      }
      if (note.missed) return;
      const packOut = run.phase === 'active' && (run.spawnedThreat | 0) >= 2;
      const earlyReady = when === 'early' && run.phase === 'active' && (run.spawnedThreat | 0) === 1 && sim >= 5 && wasp;
      if (when === 'early' && !earlyReady) {
        if (sim > 12) note.missed = { ...runSnapshot(state, wasp), reason: 'lesson-not-held' };
        return;
      }
      if (when === 'late' && !packOut) {
        if (sim > 54) note.missed = { ...runSnapshot(state, wasp), reason: 'pack-never-arrived' };
        return;
      }
      const live = wasp && state.entities.get(wasp.id);
      if (!live || live !== wasp || live.alive === false) {
        note.missed = { ...runSnapshot(state, wasp), reason: 'lesson-wasp-gone', packOut };
        return;
      }
      const attackerId = attacker === 'player' ? state.playerId : asteroidAttackerId(state);
      if (attackerId == null) {
        note.missed = { reason: 'no-attacker' };
        return;
      }
      const chip = inspectParts ? chipLessonParts(state, live) : null;
      // The damage latch lives on the state object, not on state.run. Noting
      // it here is the thrust probe: the packet is admitted, and the lesson
      // hold is what has to keep a rock from clearing the hull.
      if (acted) noteSwarmPilotAction(state);
      const result = strike(runtime, state, live, attackerId, originKind);
      if (chip) {
        const hitId = result && result.subsystemId;
        const hit = hitId && combatantRuntime(state, live) && combatantRuntime(state, live).subsystems[hitId];
        const beforeHealth = result && result.subsystemResult ? result.subsystemResult.before : null;
        note.parts = {
          ...readLessonParts(state, live, chip.plantedId),
          armorBefore: chip.armorBefore,
          armorHp: live.armorHp,
          shieldAfter: live.shield,
          shieldBroke: result && result.shieldBroke === true,
          beforeArmor: result && result.before ? result.before.armor : null,
          hitId,
          hitHealth: hit ? hit.health : null,
          hitBefore: beforeHealth,
          hitMax: hit ? hit.maxHealth : null,
          hitPending: hit && hit.pendingTransition ? true : false,
        };
        clearPlantedDestroy(state, live, chip.plantedId);
      }
      note.struck = runSnapshot(state, live);
      note.strikeResult = result && result.ok === true ? 'ok' : (result && result.reason) || 'no-result';
      struckSim = sim;
    },
  });
  return note;
}

test('before the pilot acts a foundry collision is refused and the lesson stays', { timeout: 90_000, concurrency: false }, async () => {
  const note = await runLesson({
    when: 'early', originKind: 'collision', attacker: 'rock', tickCap: 14 * 60,
  });
  assert.ok(note.struck, `lesson wasp was not on the field: ${JSON.stringify(note)}`);
  assert.equal(note.strikeResult, 'swarm_waiting_for_input', JSON.stringify(note));
  assert.equal(note.struck.alive, true, `pre-act collision cleared the lesson wasp: ${JSON.stringify(note)}`);
  assert.equal(note.struck.spawned, 1, `pre-act collision released the pack: ${JSON.stringify(note)}`);
  assert.ok(note.after, `no follow-up sample: ${JSON.stringify(note)}`);
  assert.equal(note.after.alive, true, `wasp died after the refused collision: ${JSON.stringify(note)}`);
  assert.equal(note.after.spawned, 1, `refused collision released the pack: ${JSON.stringify(note)}`);
  assert.equal(note.after.resolved, 0, `refused collision counted a kill: ${JSON.stringify(note)}`);
  assert.equal(note.after.released, false, `opening lesson released: ${JSON.stringify(note)}`);
});

test('a player shot still ends the opening lesson and brings the pack', { timeout: 90_000, concurrency: false }, async () => {
  const note = await runLesson({
    when: 'early', originKind: 'weapon', attacker: 'player', tickCap: 16 * 60, acted: true,
  });
  assert.ok(note.struck, `lesson wasp was not on the field: ${JSON.stringify(note)}`);
  assert.equal(note.strikeResult, 'ok', JSON.stringify(note));
  assert.equal(note.struck.alive, false, `player shot left the wasp alive: ${JSON.stringify(note)}`);
  assert.ok(note.after, `no follow-up sample: ${JSON.stringify(note)}`);
  assert.equal(note.after.released, true, `lesson did not release: ${JSON.stringify(note)}`);
  assert.ok(note.after.spawned >= 2, `pack did not arrive: ${JSON.stringify(note)}`);
});

test('seed 4242: after the pilot acts a foundry collision does not kill the lesson wasp', { timeout: 90_000, concurrency: false }, async () => {
  const note = await runLesson({
    when: 'early', originKind: 'collision', attacker: 'rock', tickCap: 14 * 60, inspectParts: true, acted: true,
  });
  assert.ok(note.struck, `lesson wasp was not on the field: ${JSON.stringify(note)}`);
  assert.equal(note.strikeResult, 'ok', JSON.stringify(note));
  assert.equal(note.struck.spawned, 1, `pack was already out: ${JSON.stringify(note)}`);
  assert.equal(note.struck.alive, true, `collision cleared the lesson wasp: ${JSON.stringify(note)}`);
  assert.ok((note.struck.hull || 0) > 0, `collision zeroed the lesson hull: ${JSON.stringify(note)}`);
  // snapshotVitals.before.armor is the armorHp the listener writes back.
  assert.equal(note.parts.armorHp, note.parts.armorBefore, `armorHp was not restored: ${JSON.stringify(note.parts)}`);
  assert.equal(note.parts.armorHp, note.parts.beforeArmor, `armorHp does not match payload.before.armor: ${JSON.stringify(note.parts)}`);
  assert.equal(note.parts.shieldBroke, true, `expected the test collision to break shields: ${JSON.stringify(note.parts)}`);
  assert.equal(note.parts.shieldAfter, 0, `shieldDown was emitted before a restored shield: ${JSON.stringify(note.parts)}`);
  assert.ok(note.parts.hitBefore > 0, `collision did not record a subsystem hit: ${JSON.stringify(note.parts)}`);
  assert.ok(note.parts.hitBefore < note.parts.hitMax, `subsystem was already at max, so the restore is ambiguous: ${JSON.stringify(note.parts)}`);
  assert.equal(note.parts.hitHealth, note.parts.hitBefore, `subsystem health was not the pre-hit value: ${JSON.stringify(note.parts)}`);
  assert.equal(note.parts.hitPending, false, `this hit's subsystem destroy stayed armed: ${JSON.stringify(note.parts)}`);
  assert.equal(note.parts.plantedPending, 'test-player-chip', `a same-tick destroy on another part was cleared: ${JSON.stringify(note.parts)}`);
  assert.ok(note.after, `no follow-up sample: ${JSON.stringify(note)}`);
  assert.equal(note.after.alive, true, `wasp died after the collision: ${JSON.stringify(note)}`);
  assert.equal(note.after.spawned, 1, `collision released the pack: ${JSON.stringify(note)}`);
  assert.equal(note.after.resolved, 0, `collision counted a kill: ${JSON.stringify(note)}`);
  assert.equal(note.after.released, false, `opening lesson released: ${JSON.stringify(note)}`);
});

test('a rock the pilot threw still kills the lesson wasp', { timeout: 90_000, concurrency: false }, async () => {
  const note = await runLesson({
    when: 'early', originKind: 'collision', attacker: 'player', tickCap: 16 * 60, acted: true,
  });
  assert.ok(note.struck, `lesson wasp was not on the field: ${JSON.stringify(note)}`);
  assert.equal(note.strikeResult, 'ok', JSON.stringify(note));
  assert.equal(note.struck.alive, false, `player collision left the wasp alive: ${JSON.stringify(note)}`);
  assert.ok(note.after && note.after.released === true, `lesson did not release: ${JSON.stringify(note)}`);
});

test('after the lesson clock the same foundry collision kills', { timeout: 120_000, concurrency: false }, async () => {
  const note = await runLesson({
    when: 'late', originKind: 'collision', attacker: 'rock', tickCap: 58 * 60, acted: true,
  });
  assert.ok(note.struck, `lesson wasp was not alive when the pack arrived: ${JSON.stringify(note)}`);
  assert.equal(note.strikeResult, 'ok', JSON.stringify(note));
  assert.ok(note.struck.spawned >= 2, `clock did not bring the pack: ${JSON.stringify(note)}`);
  assert.equal(note.struck.alive, false, `post-clock collision left the wasp alive: ${JSON.stringify(note)}`);
});
