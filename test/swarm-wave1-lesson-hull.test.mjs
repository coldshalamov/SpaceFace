// Seed 4242, Ricochet Foundry, fresh profile. Player-truth on 826c:
// the lesson wasp dies to an asteroid at sim 8.3 (active) or a wreck at sim
// 29.9 (idle), the empty cohort releases the pack, and round 1 never clears.
// The headless foundry parks those rocks, so this drives the live kernel with
// the same collision origin the damage path uses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
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
  };
}

/**
 * Idle fresh-profile foundry. `when` is 'early' (lesson still held) or 'late'
 * (the 45s clock has already brought the pack). `originKind` is 'collision'
 * or 'weapon'. attacker is 'rock' or 'player'.
 */
async function runLesson({ when, originKind, attacker, tickCap }) {
  const note = {
    struck: null,
    strikeResult: null,
    after: null,
    releasedAt: null,
    missed: null,
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
      const result = strike(runtime, state, live, attackerId, originKind);
      note.struck = runSnapshot(state, live);
      note.strikeResult = result && result.ok === true ? 'ok' : (result && result.reason) || 'no-result';
      struckSim = sim;
    },
  });
  return note;
}

test('a player shot still ends the opening lesson and brings the pack', { timeout: 90_000, concurrency: false }, async () => {
  const note = await runLesson({
    when: 'early', originKind: 'weapon', attacker: 'player', tickCap: 16 * 60,
  });
  assert.ok(note.struck, `lesson wasp was not on the field: ${JSON.stringify(note)}`);
  assert.equal(note.strikeResult, 'ok', JSON.stringify(note));
  assert.equal(note.struck.alive, false, `player shot left the wasp alive: ${JSON.stringify(note)}`);
  assert.ok(note.after, `no follow-up sample: ${JSON.stringify(note)}`);
  assert.equal(note.after.released, true, `lesson did not release: ${JSON.stringify(note)}`);
  assert.ok(note.after.spawned >= 2, `pack did not arrive: ${JSON.stringify(note)}`);
});

test('seed 4242: a foundry collision does not kill the lesson wasp or release the pack', { timeout: 90_000, concurrency: false }, async () => {
  const note = await runLesson({
    when: 'early', originKind: 'collision', attacker: 'rock', tickCap: 14 * 60,
  });
  assert.ok(note.struck, `lesson wasp was not on the field: ${JSON.stringify(note)}`);
  assert.equal(note.strikeResult, 'ok', JSON.stringify(note));
  assert.equal(note.struck.spawned, 1, `pack was already out: ${JSON.stringify(note)}`);
  assert.equal(note.struck.alive, true, `collision cleared the lesson wasp: ${JSON.stringify(note)}`);
  assert.ok((note.struck.hull || 0) > 0, `collision zeroed the lesson hull: ${JSON.stringify(note)}`);
  assert.ok(note.after, `no follow-up sample: ${JSON.stringify(note)}`);
  assert.equal(note.after.alive, true, `wasp died after the collision: ${JSON.stringify(note)}`);
  assert.equal(note.after.spawned, 1, `collision released the pack: ${JSON.stringify(note)}`);
  assert.equal(note.after.resolved, 0, `collision counted a kill: ${JSON.stringify(note)}`);
  assert.equal(note.after.released, false, `opening lesson released: ${JSON.stringify(note)}`);
});

test('a rock the pilot threw still kills the lesson wasp', { timeout: 90_000, concurrency: false }, async () => {
  const note = await runLesson({
    when: 'early', originKind: 'collision', attacker: 'player', tickCap: 16 * 60,
  });
  assert.ok(note.struck, `lesson wasp was not on the field: ${JSON.stringify(note)}`);
  assert.equal(note.strikeResult, 'ok', JSON.stringify(note));
  assert.equal(note.struck.alive, false, `player collision left the wasp alive: ${JSON.stringify(note)}`);
  assert.ok(note.after && note.after.released === true, `lesson did not release: ${JSON.stringify(note)}`);
});

test('after the lesson clock the same foundry collision kills', { timeout: 120_000, concurrency: false }, async () => {
  const note = await runLesson({
    when: 'late', originKind: 'collision', attacker: 'rock', tickCap: 58 * 60,
  });
  assert.ok(note.struck, `lesson wasp was not alive when the pack arrived: ${JSON.stringify(note)}`);
  assert.equal(note.strikeResult, 'ok', JSON.stringify(note));
  assert.ok(note.struck.spawned >= 2, `clock did not bring the pack: ${JSON.stringify(note)}`);
  assert.equal(note.struck.alive, false, `post-clock collision left the wasp alive: ${JSON.stringify(note)}`);
});
