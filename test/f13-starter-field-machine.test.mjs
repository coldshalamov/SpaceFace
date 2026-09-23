// F13 — one cracker in the Helios starter field. A light hull that enters the mouth
// is thrown by the existing field kernel, and the contact leaves debris. The mouth
// does not chase the pilot.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { everydaySpaceKitFileForPlaceId } from '../src/data/everydaySpaceKitDressing.js';
import {
  KILL_MACHINES,
  STARTER_FIELD_ID,
  STARTER_FIELD_MACHINE,
  STARTER_FIELD_SECTOR_ID,
  killMachinePhase,
  killMachinesForSector,
  pointInsideKillMachine,
} from '../src/data/environmentalMachinery.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { globalToSectorLocalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { combat } from '../src/systems/combat.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { fields } from '../src/systems/fields.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';

const LONG = { timeout: 180_000 };
const SEED = 1313;
const LIGHT_HULL_ID = 'ship_wasp';
const PLAYER_HULL_ID = 'ship_kestrel';
const SURGE_TICKS = 240;

function starterField() {
  const sector = SECTORS.find((row) => row.id === STARTER_FIELD_SECTOR_ID);
  return (sector.fields || []).find((row) => row.id === STARTER_FIELD_ID);
}

function localDistance(point, center) {
  return Math.hypot(point.x - center.x, point.z - center.z);
}

function surgeSimTime(machine) {
  return machine.phaseOffsetS + machine.cycle.warningS + 0.35;
}

function shovePose(machine) {
  const origin = machine.globalPos;
  const dx = machine.anvil.pos.x - origin.x;
  const dz = machine.anvil.pos.z - origin.z;
  const len = Math.hypot(dx, dz) || 1;
  const along = 16;
  return {
    pos: { x: origin.x + (dx / len) * along, z: origin.z + (dz / len) * along },
    rot: Math.atan2(dz, dx),
  };
}

function spectatorPose(machine) {
  return {
    x: machine.globalPos.x - machine.dir.x * 90,
    z: machine.globalPos.z - machine.dir.z * 90,
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

test('the cracker sits in the starter field and is not one of the Ceres mouths', () => {
  const field = starterField();
  const machine = STARTER_FIELD_MACHINE;
  assert.ok(field, 'Helios still has the starter claim');
  assert.equal(killMachinesForSector(STARTER_FIELD_SECTOR_ID)[0], machine);
  assert.equal(killMachinesForSector('sector_ceres_belt').length, KILL_MACHINES.length);
  assert.equal(KILL_MACHINES.some((row) => row.id === machine.id), false);
  const mouthLocal = machine.localPos;
  const anvilLocal = globalToSectorLocalForSector(machine.anvil.pos, machine.sectorId);
  assert.ok(localDistance(mouthLocal, field.center) <= field.clusterRadius,
    `mouth is ${localDistance(mouthLocal, field.center).toFixed(1)} outside ${field.clusterRadius}`);
  assert.ok(localDistance(anvilLocal, field.center) <= field.clusterRadius,
    `anvil is ${localDistance(anvilLocal, field.center).toFixed(1)} outside ${field.clusterRadius}`);
  assert.equal(everydaySpaceKitFileForPlaceId(machine.placeId), 'places/place_crusher_module.glb');
  assert.equal(pointInsideKillMachine(machine, spectatorPose(machine)), false);
  assert.equal(pointInsideKillMachine(machine, shovePose(machine).pos), true);
  assert.equal(machine.fields[0].strength > 0, true);
  assert.equal(killMachinePhase(machine, machine.phaseOffsetS + 0.2).fieldStrengthScale, 0);
});

test('a Helios visit places the jaw and does not register it while the pilot is in Ceres', () => {
  const machine = STARTER_FIELD_MACHINE;
  const placed = [];
  const world = {
    _spawnPlaceProp(active, sector, placeId, pos, options) {
      placed.push({ activeId: active.id, sectorId: sector.id, placeId, pos, options });
      return { id: 'claim-cracker' };
    },
  };
  const fieldBook = {
    byId: {},
    registerEnvironmental(field) { this.byId[field.id] = field; return field; },
    unregisterExternal(id) { delete this.byId[id]; return true; },
    hasExternal(id) { return !!this.byId[id]; },
    updateExternal() {},
  };
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: surgeSimTime(machine),
    playerId: 1,
    world: {
      currentSectorId: STARTER_FIELD_SECTOR_ID,
      activeSector: { id: STARTER_FIELD_SECTOR_ID, pois: [], dressing: [] },
      sectors: {
        [STARTER_FIELD_SECTOR_ID]: { id: STARTER_FIELD_SECTOR_ID },
      },
    },
    entities: new Map([[1, {
      id: 1, type: 'ship', alive: true, isPlayer: true, pos: spectatorPose(machine),
    }]]),
    sites: { worldOrder: [], worldById: {} },
  };
  const system = Object.create(environmentalMachinery);
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    system.init({
      state,
      bus: { on() { return () => {}; }, emit() {} },
      registry: { get(name) { return name === 'fields' ? fieldBook : name === 'world' ? world : null; } },
    });
    system.update(1 / 60, state);
    assert.equal(placed.length, 1);
    assert.equal(placed[0].placeId, 'place_crusher_module');
    assert.equal(placed[0].options.worldOneOff, true);
    assert.equal(placed[0].options.name, 'Claim Cracker');
    assert.ok(fieldBook.byId[machine.fields[0].id], 'the intake is registered in Helios');
    assert.equal(fieldBook.byId[machine.fields[0].id].team, null, 'the mouth has no team to chase');
    system.update(1 / 60, state);
    assert.equal(placed.length, 1, 'the jaw is placed once per visit');

    state.world.currentSectorId = 'sector_ceres_belt';
    state.world.activeSector = { id: 'sector_ceres_belt', pois: [], dressing: [] };
    system.update(1 / 60, state);
    assert.equal(fieldBook.byId[machine.fields[0].id], undefined,
      'leaving Helios drops the starter intake');
    assert.equal(placed.length, 1, 'Ceres does not place a second jaw');
  } finally {
    system.destroy();
    FIELD_FLAGS.enabled = previous;
  }
});

test('a light hull shoved into the starter mouth leaves debris, and the pilot beside it does not', LONG, async () => {
  const machine = STARTER_FIELD_MACHINE;
  const pose = shovePose(machine);
  const playerPos = spectatorPose(machine);
  const simTime = surgeSimTime(machine);
  const previousFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const host = await bootRealPath({
    seed: SEED,
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
      pos: playerPos,
      rot: 0,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });
  try {
    host.state.world = host.state.world || {};
    host.state.world.currentSectorId = STARTER_FIELD_SECTOR_ID;
    host.state.simTime = simTime;
    const victim = host.spawnShip({
      hullId: LIGHT_HULL_ID,
      pos: pose.pos,
      rot: pose.rot,
      team: 1,
      factionId: 'faction_dmc',
    });
    let debris = 0;
    host.bus.on('combat:collisionDebris', (receipt) => {
      if (receipt && receipt.targetId === victim.id && receipt.count > 0) debris += receipt.count;
    });
    const playerHull0 = hullOf(host.player);
    const victimSpeed0 = speedOf(victim);
    host.step(1, {
      before({ state }) {
        state.world.currentSectorId = STARTER_FIELD_SECTOR_ID;
        state.simTime = simTime;
      },
    });
    let maxVictimSpeed = victimSpeed0;
    let maxPlayerSpeed = speedOf(host.player);
    let died = false;
    host.step(SURGE_TICKS, {
      before({ state }) {
        state.world.currentSectorId = STARTER_FIELD_SECTOR_ID;
        state.simTime = simTime;
      },
      after() {
        maxVictimSpeed = Math.max(maxVictimSpeed, speedOf(victim));
        maxPlayerSpeed = Math.max(maxPlayerSpeed, speedOf(host.player));
        if (victim.alive === false || hullOf(victim) <= 0) {
          died = true;
          return false;
        }
        return undefined;
      },
    });
    const thrown = maxVictimSpeed - victimSpeed0;
    console.log([
      `F13 seed=${SEED}`,
      `thrown=${thrown.toFixed(2)}`,
      `died=${died}`,
      `debris=${debris}`,
      `playerSpeed=${maxPlayerSpeed.toFixed(2)}`,
      `playerHull=${hullOf(host.player).toFixed(1)}/${playerHull0.toFixed(1)}`,
    ].join(' '));
    assert.equal(host.proof().backend, 'rapier-dynamic');
    assert.ok(died || thrown > 25, `the mouth must throw or break the light (thrown ${thrown.toFixed(1)})`);
    assert.ok(debris >= 1, 'the contact must leave a debris receipt');
    assert.ok(maxPlayerSpeed < 12, `the mouth must not chase the pilot (speed ${maxPlayerSpeed.toFixed(1)})`);
    assert.equal(hullOf(host.player), playerHull0, 'the pilot beside the mouth keeps their hull');
    assert.equal(pointInsideKillMachine(machine, host.player.pos), false);
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previousFields;
  }
});
