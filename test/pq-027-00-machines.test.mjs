// PQ-027.00 — three Ceres machines that kill by moving mass into an anvil.
// The bite is a schedule; the payoff is PQ-137.06 terrain crumple. Never a hull-drain aura.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { hazardLanguageFor } from '../src/data/hazardLanguage.js';
import {
  KILL_MACHINE_SECTOR_ID,
  KILL_MACHINES,
  killMachinePhase,
  pointInsideKillMachine,
} from '../src/data/environmentalMachinery.js';
import { combat } from '../src/systems/combat.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { fields } from '../src/systems/fields.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';

const LONG = { timeout: 180_000 };
const SEED = 2700;
const LIGHT_HULL_ID = 'ship_wasp';
const PLAYER_HULL_ID = 'ship_kestrel';
const SURGE_TICKS = 240;
const CALM_TICKS = 120;
const TELEGRAPH_TICKS = 36;
const SCHEDULE_TICKS = 300;

function surgeSimTime(machine) {
  return machine.phaseOffsetS + machine.cycle.warningS + 0.35;
}

function warningSimTime(machine) {
  return machine.phaseOffsetS + 0.2;
}

function calmSimTime(machine) {
  return machine.phaseOffsetS + machine.cycle.warningS + machine.cycle.surgeS + 0.35;
}

function shovePose(machine) {
  const origin = machine.globalPos;
  if (machine.id === 'excavator_jaws') {
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

function telegraphPose(machine) {
  const origin = machine.globalPos;
  const along = machine.id === 'excavator_jaws' ? 80 : 54;
  const across = machine.id === 'excavator_jaws' ? 50 : 18;
  return {
    x: origin.x + machine.dir.x * along + machine.perp.x * across,
    z: origin.z + machine.dir.z * along + machine.perp.z * across,
  };
}

function spectatorPose(machine) {
  return {
    x: machine.globalPos.x - machine.dir.x * 70 - machine.perp.x * 40,
    z: machine.globalPos.z - machine.dir.z * 70 - machine.perp.z * 40,
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

function formatRow(row) {
  return [
    `PQ-027.00 seed=${SEED}`,
    `machine=${row.id}`,
    `phase=${row.phase}`,
    `fields=${row.fieldsEnabled}`,
    `died=${row.died}`,
    `deathTick=${row.deathTick}`,
    `hull0=${row.hull0.toFixed(1)}`,
    `hull=${row.hull.toFixed(1)}`,
    `maxSpeed=${row.maxSpeed.toFixed(2)}`,
    `slams=${row.slams}`,
    `enter=${row.hazardEnter}`,
    `enterTick=${row.enterTick}`,
    `anvil=${row.anvil}`,
    `language=${row.language}`,
    `backend=${row.proof.backend}`,
  ].join(' ');
}

async function runMachine(machine, {
  simTime,
  ticks,
  fieldsEnabled = true,
  freezeTime = true,
  playerInVolume = false,
  spawnVictim = true,
} = {}) {
  const pose = shovePose(machine);
  const playerPos = playerInVolume ? telegraphPose(machine) : spectatorPose(machine);
  const previousFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = fieldsEnabled;
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
    host.state.world.currentSectorId = KILL_MACHINE_SECTOR_ID;
    host.state.simTime = simTime;
    const victim = spawnVictim ? host.spawnShip({
      hullId: LIGHT_HULL_ID,
      pos: pose.pos,
      rot: pose.rot,
      team: 1,
      factionId: 'faction_dmc',
    }) : null;
    let slams = 0;
    let hazardEnter = 0;
    let enterTick = null;
    host.bus.on('combat:collisionConsequence', (receipt) => {
      if (victim && receipt && (receipt.targetId === victim.id || receipt.otherId === victim.id)) {
        slams += 1;
      }
    });
    host.bus.on('hazard:enter', (payload) => {
      if (payload && payload.zoneId === machine.id && payload.zoneType === machine.hazardType) {
        hazardEnter += 1;
        if (enterTick == null) enterTick = host.state.tick | 0;
      }
    });
    const hull0 = victim ? hullOf(victim) : hullOf(host.player);
    host.step(1, {
      before({ state }) {
        state.world.currentSectorId = KILL_MACHINE_SECTOR_ID;
        if (freezeTime) state.simTime = simTime;
      },
    });
    const bodies = victim ? [host.player, victim] : [host.player];
    host.assertBodies(bodies, `${machine.id} bodies`);
    let maxSpeed = victim ? speedOf(victim) : speedOf(host.player);
    let died = false;
    let deathTick = null;
    const stepped = host.step(ticks, {
      before({ state }) {
        state.world.currentSectorId = KILL_MACHINE_SECTOR_ID;
        if (freezeTime) state.simTime = simTime;
      },
      after({ tick }) {
        const watched = victim || host.player;
        maxSpeed = Math.max(maxSpeed, speedOf(watched));
        if (victim && (victim.alive === false || hullOf(victim) <= 0)) {
          died = true;
          deathTick = tick;
          return false;
        }
        return undefined;
      },
    });
    const anvil = (host.state.entityList || []).find((entity) => (
      entity && entity.data && entity.data.killMachineAnvilId === machine.anvil.id
    ));
    const language = hazardLanguageFor(machine.hazardType);
    const phaseAt = freezeTime ? simTime : host.state.simTime;
    return {
      id: machine.id,
      phase: killMachinePhase(machine, freezeTime ? simTime : phaseAt).phase,
      fieldsEnabled,
      died,
      alive: victim ? (victim.alive !== false && hullOf(victim) > 0) : (host.player.alive !== false),
      deathTick,
      enterTick,
      ticksStepped: stepped,
      hull0,
      hull: victim ? hullOf(victim) : hullOf(host.player),
      maxSpeed,
      slams,
      hazardEnter,
      anvil: !!anvil,
      language: language ? language.glyph : null,
      playerInside: pointInsideKillMachine(machine, host.player.pos),
      proof: host.proof(),
    };
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previousFields;
  }
}

test('PQ-027.00 before: fields off, a shoved light keeps its hull', LONG, async () => {
  const machine = KILL_MACHINES[0];
  const result = await runMachine(machine, {
    simTime: surgeSimTime(machine),
    ticks: SURGE_TICKS,
    fieldsEnabled: false,
  });
  console.log(formatRow(result));
  assert.equal(result.proof.backend, 'rapier-dynamic', 'before stays on Rapier');
  assert.equal(result.died, false, 'without the field kernel the jaws are dressing');
  assert.equal(result.slams, 0, 'no slam-law payoff when the current is off');
  assert.ok(result.maxSpeed < 8, `before must not accelerate (max ${result.maxSpeed.toFixed(1)})`);
  assert.equal(result.hull, result.hull0, 'before: hull is unchanged');
});

test('PQ-027.00 a shoved light dies in each scheduled machine', LONG, async () => {
  const results = [];
  for (const machine of KILL_MACHINES) {
    const language = hazardLanguageFor(machine.hazardType);
    assert.ok(language, `${machine.id} must speak existing hazard language`);
    assert.ok(language.counterplay.includes('time'), `${machine.id} counterplay is the schedule`);
    const result = await runMachine(machine, {
      simTime: surgeSimTime(machine),
      ticks: SURGE_TICKS,
    });
    results.push(result);
    console.log(formatRow(result));
    assert.equal(result.proof.backend, 'rapier-dynamic', `${machine.id} stays on Rapier`);
    assert.equal(result.phase, 'surge', `${machine.id} shove is during the bite`);
    assert.equal(result.anvil, true, `${machine.id} has a terrain anvil`);
    assert.ok(result.slams >= 1, `${machine.id} must land a slam-law payoff`);
    assert.ok(result.maxSpeed > 45,
      `${machine.id} must accelerate the hull (max ${result.maxSpeed.toFixed(1)})`);
    assert.equal(result.died, true, `${machine.id} must kill the shoved light`);
    assert.ok(result.deathTick != null && result.deathTick / 60 < machine.cycle.surgeS,
      `${machine.id} must finish inside the authored bite (${result.deathTick} ticks)`);
  }
  assert.deepEqual(results.map((row) => row.id), [
    'excavator_jaws',
    'furnace_mouth',
    'mass_driver_breech',
  ]);
  assert.equal(results.filter((row) => row.died).length, 3);
});

test('PQ-027.00 warning telegraphs before the bite, with no force', LONG, async () => {
  const results = [];
  for (const machine of KILL_MACHINES) {
    const result = await runMachine(machine, {
      simTime: warningSimTime(machine),
      ticks: TELEGRAPH_TICKS,
      playerInVolume: true,
      spawnVictim: false,
    });
    results.push(result);
    console.log(formatRow(result));
    assert.equal(result.phase, 'warning', `${machine.id} telegraph is the warning window`);
    assert.ok(result.playerInside, `${machine.id} player stands in the danger volume`);
    assert.ok(result.hazardEnter >= 1, `${machine.id} must speak before it kills`);
    assert.ok(result.language, `${machine.id} uses hazard language, not a new name`);
    assert.equal(result.died, false, `${machine.id} warning is not a damage tick`);
    assert.ok(result.maxSpeed < 20, `${machine.id} warning writes no force (max ${result.maxSpeed.toFixed(1)})`);
  }
  assert.equal(results.filter((row) => row.hazardEnter >= 1).length, 3);
});

test('PQ-027.00 the schedule itself finishes a light: telegraph then surge kill', LONG, async () => {
  const machine = KILL_MACHINES[0];
  const result = await runMachine(machine, {
    simTime: warningSimTime(machine),
    ticks: SCHEDULE_TICKS,
    freezeTime: false,
    playerInVolume: true,
  });
  console.log(formatRow({ ...result, phase: 'warning→surge' }));
  assert.equal(result.proof.backend, 'rapier-dynamic', 'schedule stays on Rapier');
  assert.ok(result.hazardEnter >= 1, 'warning must fire before the bite');
  assert.equal(result.died, true, 'the advancing schedule must still kill the light');
  assert.ok(result.slams >= 1, 'death is the slam-law payoff, not a tick');
  assert.ok(result.enterTick != null && result.deathTick != null, 'both telegraph and death are dated');
  assert.ok(result.enterTick < result.deathTick,
    `telegraph (${result.enterTick}) must precede the kill (${result.deathTick})`);
});

test('PQ-027.00 the same shove during calm does not finish the light', LONG, async () => {
  const machine = KILL_MACHINES[0];
  const result = await runMachine(machine, {
    simTime: calmSimTime(machine),
    ticks: CALM_TICKS,
  });
  console.log(formatRow(result));
  assert.equal(result.phase, 'calm', 'calm is the authored safe window');
  assert.equal(result.alive, true, 'calm is the safe window');
  assert.ok(result.hull > result.hull0 * 0.5, 'calm contact is not the slam-law bite');
  assert.ok(result.maxSpeed < 40, `calm must not accelerate into a crumple (max ${result.maxSpeed.toFixed(1)})`);
  assert.equal(result.slams, 0, 'calm must not land a crumple');
});
