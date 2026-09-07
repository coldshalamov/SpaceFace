// PQ-027.00 — a shoved light dies in each Ceres kill machine on the live Rapier path.
// The machine moves the hull; PQ-137.06 terrain crumple is the payoff. Skip capture.
import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_FLAGS } from '../src/data/fields.js';
import { KILL_MACHINE_SECTOR_ID, KILL_MACHINES } from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { fields } from '../src/systems/fields.js';
import { combat } from '../src/systems/combat.js';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';

const LONG = { timeout: 180_000 };
const LIGHT_HULL_ID = 'ship_wasp';
const PLAYER_HULL_ID = 'ship_kestrel';
const SURGE_TICKS = 240;
const CALM_TICKS = 120;

function surgeSimTime(machine) {
  return machine.phaseOffsetS + machine.cycle.warningS + 0.35;
}

function calmSimTime(machine) {
  return machine.phaseOffsetS + machine.cycle.warningS + machine.cycle.surgeS + 0.35;
}

function shovePose(machine) {
  const origin = machine.globalPos;
  if (machine.id === 'excavator_jaws') {
    // Sheet fields squeeze onto the centerline. Stand off beyond hull+anvil radii so the
    // pinch is a slam, not a spawn overlap that Rapier depenetrates below crumple speed.
    const along = 12;
    const across = machine.anvil.radius + 14 + 16;
    return {
      pos: {
        x: origin.x + machine.perp.x * across + machine.dir.x * along,
        z: origin.z + machine.perp.z * across + machine.dir.z * along,
      },
      rot: Math.atan2(-machine.perp.z, -machine.perp.x),
    };
  }
  const dx = machine.anvil.pos.x - origin.x;
  const dz = machine.anvil.pos.z - origin.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const along = machine.id === 'mass_driver_breech' ? 30 : 16;
  return {
    pos: { x: origin.x + ux * along, z: origin.z + uz * along },
    rot: Math.atan2(uz, ux),
  };
}

function speedOf(entity) {
  const vel = entity && entity.vel;
  if (!vel) return 0;
  return Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0);
}

function hullOf(entity) {
  const hull = Number(entity && entity.hull);
  return Number.isFinite(hull) ? hull : 0;
}

async function runMachine(machine, { simTime, ticks }) {
  const pose = shovePose(machine);
  const previousFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const host = await bootRealPath({
    seed: 2700,
    systems: [
      'actions',
      'flightV3',
      environmentalMachinery,
      fields,
      'physics',
      'collisionConsequences',
      combat,
      terrainAnchors,
    ],
    hulls: [{
      hullId: PLAYER_HULL_ID,
      pos: {
        x: machine.globalPos.x - machine.dir.x * 70 - machine.perp.x * 40,
        z: machine.globalPos.z - machine.dir.z * 70 - machine.perp.z * 40,
      },
      rot: 0,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });
  try {
    host.state.world = host.state.world || {};
    host.state.world.currentSectorId = KILL_MACHINE_SECTOR_ID;
    host.state.simTime = simTime;
    const victim = host.spawnShip({
      hullId: LIGHT_HULL_ID,
      pos: pose.pos,
      rot: pose.rot,
      team: 1,
      factionId: 'faction_dmc',
    });
    const shoveSpeed = speedOf(victim);
    const hull0 = hullOf(victim);
    host.step(1);
    host.assertBodies([host.player, victim], `${machine.id} bodies`);
    let maxSpeed = shoveSpeed;
    let died = false;
    host.step(ticks, {
      before({ state }) {
        state.world.currentSectorId = KILL_MACHINE_SECTOR_ID;
        state.simTime = simTime;
      },
      after() {
        maxSpeed = Math.max(maxSpeed, speedOf(victim));
        if (victim.alive === false || hullOf(victim) <= 0) {
          died = true;
          return false;
        }
        return undefined;
      },
    });
    const anvil = (host.state.entityList || []).find((entity) => (
      entity && entity.data && entity.data.killMachineAnvilId === machine.anvil.id
    ));
    return {
      died,
      alive: victim.alive !== false && hullOf(victim) > 0,
      hull0,
      hull: hullOf(victim),
      shoveSpeed,
      maxSpeed,
      anvil: !!anvil,
      proof: host.proof(),
    };
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previousFields;
  }
}

test('a shoved light dies in the excavator, furnace, and mass-driver during the bite', LONG, async () => {
  const results = [];
  for (const machine of KILL_MACHINES) {
    const result = await runMachine(machine, {
      simTime: surgeSimTime(machine),
      ticks: SURGE_TICKS,
    });
    results.push({ id: machine.id, ...result });
    assert.equal(result.proof.backend, 'rapier-dynamic', `${machine.id} stays on Rapier`);
    assert.equal(result.anvil, true, `${machine.id} has a terrain anvil`);
    assert.ok(result.maxSpeed > 45,
      `${machine.id} must accelerate the hull (max ${result.maxSpeed.toFixed(1)})`);
    assert.equal(result.died, true, `${machine.id} must kill the shoved light`);
  }
  assert.equal(results.filter((row) => row.died).length, 3);
});

test('the same shove during calm does not finish the light', LONG, async () => {
  const machine = KILL_MACHINES[0];
  const result = await runMachine(machine, {
    simTime: calmSimTime(machine),
    ticks: CALM_TICKS,
  });
  assert.equal(result.alive, true, 'calm is the safe window');
  assert.ok(result.hull > result.hull0 * 0.5, 'calm contact is not the slam-law bite');
  assert.ok(result.maxSpeed < 40, `calm must not accelerate into a crumple (max ${result.maxSpeed.toFixed(1)})`);
});
