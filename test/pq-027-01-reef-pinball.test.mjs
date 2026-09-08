// PQ-027.01 — a shoved Pallas reef mine pinballs the authored string.
// The current moves mass; Rapier contacts are the cascade. Never an HP aura.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  PALLAS_REEF_CYCLE_S,
  PALLAS_REEF_FIELD,
  PALLAS_REEF_MINES,
  PALLAS_REEF_SECTOR_ID,
  pallasReefPhase,
} from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { fields } from '../src/systems/fields.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';

const LONG = { timeout: 180_000 };
const SEED = 2701;
const PLAYER_HULL_ID = 'ship_kestrel';
const SURGE_TICKS = 360;
const CALM_TICKS = 180;
const CARRY_SPEED = 8;
const JUMP_SPEED = 6;

function surgeSimTime() {
  return PALLAS_REEF_CYCLE_S.warningS + 0.4;
}

function calmSimTime() {
  return PALLAS_REEF_CYCLE_S.warningS + PALLAS_REEF_CYCLE_S.surgeS + 0.4;
}

function playerPose() {
  const dir = PALLAS_REEF_FIELD.dir;
  const perp = { x: -dir.z, z: dir.x };
  const origin = PALLAS_REEF_FIELD.center;
  return {
    x: origin.x + perp.x * 90 + dir.x * 140,
    z: origin.z + perp.z * 90 + dir.z * 140,
  };
}

function speedOf(entity) {
  const vel = entity && entity.vel;
  if (!vel) return 0;
  return Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0);
}

function pairKey(a, b) {
  const lo = Math.min(a.id, b.id);
  const hi = Math.max(a.id, b.id);
  return `${lo}:${hi}`;
}

function reefMines(state) {
  return (state.entityList || []).filter((entity) => (
    entity && entity.alive !== false && entity.data && entity.data.reefMine === true
  )).sort((a, b) => (a.data.reefMineSlot || 0) - (b.data.reefMineSlot || 0));
}

function nearContact(a, b) {
  if (!a || !b || !a.pos || !b.pos) return false;
  const dx = a.pos.x - b.pos.x;
  const dz = a.pos.z - b.pos.z;
  const limit = (a.radius || 0) + (b.radius || 0) + 1.5;
  return dx * dx + dz * dz <= limit * limit;
}

function formatRow(row) {
  return [
    `PQ-027.01 seed=${SEED}`,
    `phase=${row.phase}`,
    `mines=${row.mineCount}`,
    `cascaded=${row.cascadedMines}`,
    `cascadePairs=${row.cascadePairs}`,
    `mineMinePairs=${row.mineMinePairs}`,
    `carried=${row.carried}`,
    `speeds=${row.speeds.map((speed) => speed.toFixed(1)).join(',')}`,
    `backend=${row.proof.backend}`,
  ].join(' ');
}

async function runReef({ simTime, ticks }) {
  const pose = playerPose();
  const previousFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const mineMinePairs = new Set();
  const cascadePairs = new Set();
  const cascadedIds = new Set();
  const host = await bootRealPath({
    seed: SEED,
    systems: [
      'actions',
      'flightV3',
      environmentalMachinery,
      fields,
      'physics',
      terrainAnchors,
    ],
    hulls: [{
      hullId: PLAYER_HULL_ID,
      pos: pose,
      rot: 0,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });
  try {
    host.state.world = host.state.world || {};
    host.state.world.currentSectorId = PALLAS_REEF_SECTOR_ID;
    host.state.simTime = simTime;
    host.bus.on('physics:impact', (payload) => {
      const a = host.state.entities.get(payload && payload.aId);
      const b = host.state.entities.get(payload && payload.bId);
      if (!a || !b) return;
      const aMine = !!(a.data && a.data.reefMine);
      const bMine = !!(b.data && b.data.reefMine);
      if (aMine && bMine) {
        mineMinePairs.add(pairKey(a, b));
        cascadePairs.add(pairKey(a, b));
        cascadedIds.add(a.id);
        cascadedIds.add(b.id);
        return;
      }
      if (aMine || bMine) cascadePairs.add(pairKey(a, b));
    });
    host.step(1, {
      before({ state }) {
        state.world.currentSectorId = PALLAS_REEF_SECTOR_ID;
        state.simTime = simTime;
      },
    });
    const mines = reefMines(host.state);
    host.assertBodies([host.player, ...mines], 'reef mine bodies');
    const prevSpeed = mines.map((mine) => speedOf(mine));
    host.step(ticks, {
      before({ state }) {
        state.world.currentSectorId = PALLAS_REEF_SECTOR_ID;
        state.simTime = simTime;
      },
      after() {
        const live = reefMines(host.state);
        for (let i = 0; i < live.length; i++) {
          const mine = live[i];
          const speed = speedOf(mine);
          const jump = speed - (prevSpeed[i] || 0);
          if (jump > JUMP_SPEED) {
            for (let j = 0; j < live.length; j++) {
              if (i === j) continue;
              if (!nearContact(mine, live[j])) continue;
              cascadePairs.add(pairKey(mine, live[j]));
              cascadedIds.add(mine.id);
              cascadedIds.add(live[j].id);
            }
          }
          prevSpeed[i] = speed;
        }
      },
    });
    const finalMines = reefMines(host.state);
    const speeds = finalMines.map((mine) => speedOf(mine));
    const carried = finalMines.filter((mine, index) => (
      index !== 0 && speeds[index] >= CARRY_SPEED
    )).length;
    return {
      phase: pallasReefPhase(simTime).phase,
      mineCount: finalMines.length,
      speeds,
      carried,
      cascadedMines: cascadedIds.size,
      cascadePairs: cascadePairs.size,
      mineMinePairs: mineMinePairs.size,
      proof: host.proof(),
    };
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previousFields;
  }
}

test('PQ-027.01 a shoved reef mine pinballs the Pallas string', LONG, async () => {
  const result = await runReef({ simTime: surgeSimTime(), ticks: SURGE_TICKS });
  console.log(formatRow(result));
  assert.equal(result.proof.backend, 'rapier-dynamic', 'reef pinball stays on Rapier');
  assert.equal(result.phase, 'surge', 'shove is during the current bite');
  assert.equal(result.mineCount, PALLAS_REEF_MINES.length, 'authored reef mines spawn');
  assert.ok(result.carried >= 3,
    `at least 3 mines besides the pinball must ride the current (carried ${result.carried})`);
  assert.ok(result.cascadedMines >= 3,
    `at least 3 mines/pods must cascade (cascaded ${result.cascadedMines})`);
  assert.ok(result.mineMinePairs >= 2,
    `the cascade must be a real Rapier contact chain (mine-mine pairs ${result.mineMinePairs})`);
  assert.ok(result.cascadePairs >= 3,
    `the string must pinball (cascade pairs ${result.cascadePairs})`);
});

test('PQ-027.01 the same reef pose during calm does not cascade', LONG, async () => {
  const result = await runReef({ simTime: calmSimTime(), ticks: CALM_TICKS });
  console.log(formatRow(result));
  assert.equal(result.phase, 'calm', 'calm is the authored safe window');
  assert.equal(result.cascadedMines, 0, `calm must not pinball mines (cascaded ${result.cascadedMines})`);
  assert.equal(result.cascadePairs, 0, `calm must not pinball (cascade pairs ${result.cascadePairs})`);
  assert.equal(result.carried, 0,
    `calm must not carry the string (carried ${result.carried}; speeds ${result.speeds.map((s) => s.toFixed(1)).join(',')})`);
});
