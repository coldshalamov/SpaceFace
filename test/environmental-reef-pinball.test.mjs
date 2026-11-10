// PQ-027.01 — authored Pallas reef current pinballs a mine string on the live Rapier path.
// The current carries loose mass; the first body through the string is the pinball.
// Skip capture. No hull-drain, no scripted lethal velocities.
import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  PALLAS_REEF_FIELD,
  PALLAS_REEF_MINES,
  PALLAS_REEF_SECTOR_ID,
  PALLAS_REEF_CYCLE_S,
} from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { fields } from '../src/systems/fields.js';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';

const LONG = { timeout: 180_000 };
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

async function runReef({ simTime, ticks }) {
  const pose = playerPose();
  const previousFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const cascadePairs = new Set();
  const host = await bootRealPath({
    seed: 2701,
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
      if (aMine && bMine) cascadePairs.add(pairKey(a, b));
      else if (aMine || bMine) cascadePairs.add(pairKey(a, b));
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
              if (nearContact(mine, live[j])) cascadePairs.add(pairKey(mine, live[j]));
            }
          }
          prevSpeed[i] = speed;
        }
      },
    });
    const finalMines = reefMines(host.state);
    const speeds = finalMines.map((mine) => speedOf(mine));
    const upstreamIndex = 0;
    const carried = finalMines.filter((mine, index) => (
      index !== upstreamIndex && speeds[index] >= CARRY_SPEED
    )).length;
    return {
      mineCount: finalMines.length,
      speeds,
      carried,
      cascade: cascadePairs.size,
      proof: host.proof(),
    };
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previousFields;
  }
}

test('Pallas surge carries the mine string and pinballs a cascade', LONG, async () => {
  const result = await runReef({ simTime: surgeSimTime(), ticks: SURGE_TICKS });
  assert.equal(result.proof.backend, 'rapier-dynamic', 'reef pinball stays on Rapier');
  assert.equal(result.mineCount, PALLAS_REEF_MINES.length, 'authored reef mines spawn');
  assert.ok(result.carried >= 3,
    `at least 3 mines besides the pinball must ride the current (carried ${result.carried}; speeds ${result.speeds.map((s) => s.toFixed(1)).join(',')})`);
  console.log(`cascade count: ${result.cascade}`);
  assert.ok(result.cascade >= 3,
    `the string must pinball (cascade ${result.cascade}; speeds ${result.speeds.map((s) => s.toFixed(1)).join(',')})`);
});

test('the same reef pose during calm does not cascade', LONG, async () => {
  const result = await runReef({ simTime: calmSimTime(), ticks: CALM_TICKS });
  console.log(`calm cascade count: ${result.cascade}`);
  assert.equal(result.cascade, 0, `calm must not pinball (cascade ${result.cascade})`);
  assert.ok(result.carried === 0,
    `calm must not carry the string (carried ${result.carried}; speeds ${result.speeds.map((s) => s.toFixed(1)).join(',')})`);
});
