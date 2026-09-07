// PQ-140.03 — twelve-body fodder resolves as ammunition under physics play.
// Headless, fixed seeds. Median time-to-resolve a light under physics ≤ under guns.
// Drives the existing FodderCohortDirector; does not touch hull HP or fork Crucible AI.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COHORT_RECIPE_RIVER,
  createFodderCohortDirector,
  isAmmunitionCourse,
  isInsideWell,
} from '../src/ai/fodderCohort.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { WEAPONS } from '../src/data/weapons.js';
import { FIELD_DEFS, FIELD_FLAGS } from '../src/data/fields.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { combat } from '../src/systems/combat.js';
import { fields } from '../src/systems/fields.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import {
  bootRealPath,
  writeRealPathInput,
} from '../scripts/lib/bench/realPath.mjs';

const SEEDS = Object.freeze([4242, 8008, 13502]);
const LONG = { timeout: 180_000 };
const DT = 1 / 60;
const PULSE = WEAPONS.find((w) => w.id === 'wpn_pulse_laser_s');
const CONCUSSION = WEAPONS.find((w) => w.id === 'wpn_concussion_cannon_m');
const PULSE_INTERVAL_TICKS = Math.max(1, Math.round(60 / PULSE.rof));
const SYSTEMS = Object.freeze([
  'tacticalAI',
  'actions',
  'flightV3',
  'aiPorts',
  tumbleStates,
  'collisionConsequences',
  'weapons',
  impulseCharges,
  fields,
  'physics',
  combat,
]);

test('isAmmunitionCourse is a closing corridor, not a radius grab', () => {
  const origin = { x: 0, z: 0 };
  const vel = { x: 80, z: 0 };
  assert.equal(isAmmunitionCourse(origin, vel, 12, { x: 80, z: 0 }, 22), true, 'rock ahead is on the throw line');
  assert.equal(isAmmunitionCourse(origin, vel, 12, { x: -80, z: 0 }, 22), false, 'rock behind is not ammunition');
  assert.equal(isAmmunitionCourse(origin, vel, 12, { x: 80, z: 90 }, 22), false, 'wide miss is not ammunition');
  assert.equal(isInsideWell({ x: 4, z: 0 }, [{ x: 0, z: 0, radius: 190, well: true }]), true);
  assert.equal(isInsideWell({ x: 400, z: 0 }, [{ x: 0, z: 0, radius: 190, well: true }]), false);
});

test('director: thrown light stays ballistic into rock; empty-space shove still rejoins', () => {
  const withRock = driveDirectorThrow({ rock: true, ticksAfterSpike: 150 });
  assert.equal(withRock.spikePlan.coast, true, 'shove into rock must coast');
  assert.equal(withRock.spikePlan.ammunition, true, 'shove into rock must read as ammunition');
  assert.equal(withRock.latePlan.coast, true, 'ammunition stays ballistic while the rock is still ahead');
  assert.equal(withRock.latePlan.ammunition, true);
  assert.ok(withRock.chainFront.ammunition, 'the body in the throw corridor toward the rock goes limp');

  const empty = driveDirectorThrow({ rock: false, ticksAfterSpike: 150 });
  assert.equal(empty.spikePlan.coast, true, 'empty-space shove still coasts (throwability)');
  assert.equal(empty.spikePlan.ammunition, false, 'empty space is not ammunition');
  assert.equal(empty.latePlan.coast, false, 'survivors rejoin after the coast timer when no mass is ahead');
  assert.equal(empty.chainFront.ammunition, false, 'M11-style empty corridor must not limp the pack');
});

test('PQ-140.03 median time-to-resolve a light under physics ≤ under guns', LONG, async () => {
  const rows = [];
  for (const seed of SEEDS) {
    const physics = await runResolveArm({ seed, mode: 'physics' });
    const guns = await runResolveArm({ seed, mode: 'guns' });
    rows.push({ seed, physics, guns });
  }

  const table = formatResolveTable(rows);
  console.log(`\nPQ-140.03 fodder ammunition\n${table}\n`);

  for (const row of rows) {
    assert.ok(row.physics.proof.sg02Ready, `seed ${row.seed} physics arm must be rapier-dynamic`);
    assert.ok(row.guns.proof.sg02Ready, `seed ${row.seed} guns arm must be rapier-dynamic`);
    assert.ok(
      row.physics.kills >= 7,
      `seed ${row.seed} physics must resolve at least 7 of 12 lights (got ${row.physics.kills})`,
    );
    assert.ok(
      Number.isFinite(row.physics.medianS),
      `seed ${row.seed} physics median must be finite, got ${row.physics.medianS}`,
    );
    assert.ok(
      Number.isFinite(row.guns.medianS),
      `seed ${row.seed} guns median must be finite, got ${row.guns.medianS}`,
    );
    assert.ok(
      row.physics.medianS <= row.guns.medianS,
      `seed ${row.seed}: physics median ${row.physics.medianS.toFixed(3)}s ` +
      `must be ≤ guns ${row.guns.medianS.toFixed(3)}s`,
    );
  }
});

function driveDirectorThrow({ rock, ticksAfterSpike }) {
  const director = createFodderCohortDirector({ seed: 1 });
  const members = [];
  for (let i = 0; i < 12; i++) {
    const lane = i % 3;
    const row = Math.floor(i / 3);
    members.push(fodderBody(i + 1, {
      x: -row * 40,
      z: (lane - 1) * 46,
      vx: 50,
      vz: 0,
    }));
  }
  const rockEntity = {
    id: 99,
    type: 'asteroid',
    alive: true,
    collides: true,
    pos: { x: 70, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 22,
    mass: 480,
  };
  const entities = new Map(members.map((e) => [e.id, e]));
  if (rock) entities.set(rockEntity.id, rockEntity);
  const entityList = [...entities.values()];
  const group = {
    id: 'ammo',
    recipeId: COHORT_RECIPE_RIVER,
    members,
    targetId: 1000,
  };
  const lookup = (id) => (id === 1000
    ? { id: 1000, pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, radius: 10 }
    : entities.get(id));
  const state = { entityList, entities };

  for (let tick = 0; tick < 30; tick++) {
    director.stepAll(tick, DT, [group], lookup, state);
  }
  // Center-lane back row (x=-40) thrown along +X through the lead (x=0) into the rock (x=70).
  const rear = members[4];
  const front = members[1];
  rear.vel.x = 110;
  rear.vel.z = 0;
  director.stepAll(30, DT, [group], lookup, state);
  const spikePlan = { ...director.planFor(rear.id) };
  director.stepAll(31, DT, [group], lookup, state);
  const chainFront = { ...director.planFor(front.id) };

  for (let i = 2; i <= ticksAfterSpike; i++) {
    director.stepAll(30 + i, DT, [group], lookup, state);
  }
  return {
    spikePlan,
    chainFront,
    latePlan: { ...director.planFor(rear.id) },
  };
}

function fodderBody(id, { x, z, vx, vz }) {
  return {
    id,
    type: 'ship',
    team: 1,
    alive: true,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    radius: 12,
    mass: 16,
    hull: 55,
    hullMax: 55,
    data: {
      ai: {
        cohortRecipe: COHORT_RECIPE_RIVER,
        squadId: 'ammo',
        cohortGate: { x: 0, z: 0 },
        passive: true,
        allowPassiveManeuver: false,
      },
    },
  };
}

async function runResolveArm({ seed, mode }) {
  const physicsPlay = mode === 'physics';
  const previousFields = FIELD_FLAGS.enabled;
  let host = null;
  try {
    FIELD_FLAGS.enabled = physicsPlay;
    host = await bootRealPath({
      seed,
      systems: SYSTEMS,
      hulls: [{
        hullId: 'ship_kestrel',
        pos: { x: 300, z: 0 },
        rot: 0,
        isPlayer: true,
        factionId: 'faction_free',
      }],
    });
    const state = host.state;
    const ships = spawnRiver(host, {
      squadId: `pq14003_${mode}_${seed}`,
      originX: 90,
      originZ: 0,
    });
    const rocks = physicsPlay ? spawnRockWall(host, { x: 205, z: 0 }) : [];
    const ids = ships.map((e) => e.id);
    const killedAt = new Map();
    const onKill = (payload) => {
      const id = payload && (payload.entityId ?? payload.id);
      if (id == null || killedAt.has(id)) return;
      if (!ids.includes(id)) return;
      killedAt.set(id, state.simTime);
    };
    host.bus.on('entity:killed', onKill);

    let wellDeployed = false;
    const settleTicks = 72;
    const engageTick = settleTicks;
    const maxTicks = physicsPlay ? 480 : 2100;
    let shoved = false;
    let lastPulseTick = -PULSE_INTERVAL_TICKS;

    host.step(1, {
      before: () => writeRealPathInput(state, {}),
    });
    host.assertBodies([host.player, ...ships], `pq140.03 ${mode} seed ${seed}`);

    const t0 = state.simTime;
    host.step(maxTicks - 1, {
      before: ({ tick }) => {
        writeRealPathInput(state, {});
        parkPlayer(host.player);
        if (physicsPlay) {
          const cx = centroidX(ships);
          const cz = centroidZ(ships);
          state.input.aimWorld = { x: cx, z: cz };
          if (tick === engageTick && !wellDeployed) {
            state.input.actions.deployWell = true;
            wellDeployed = true;
          }
          if (tick === engageTick && !shoved) {
            shoveCohort(host, ships, { x: 1, z: 0 });
            shoved = true;
          }
        } else if (tick >= engageTick && tick - lastPulseTick >= PULSE_INTERVAL_TICKS) {
          const victim = nearestLive(ships, host.player);
          if (victim) {
            pulseHit(host, victim);
            lastPulseTick = tick;
          }
        }
        return killedAt.size >= 12 ? false : undefined;
      },
      after: () => (killedAt.size >= (physicsPlay ? 12 : 7) ? false : undefined),
    });

    const times = ships.map((ship) => {
      if (killedAt.has(ship.id)) return killedAt.get(ship.id) - t0;
      if (ship.alive === false || (Number.isFinite(ship.hull) && ship.hull <= 0)) {
        return state.simTime - t0;
      }
      return Infinity;
    });
    return {
      mode,
      seed,
      medianS: median(times),
      kills: times.filter((t) => Number.isFinite(t)).length,
      times,
      windowS: state.simTime - t0,
      wellDeployed,
      proof: host.proof(),
    };
  } finally {
    if (host) host.dispose();
    FIELD_FLAGS.enabled = previousFields;
  }
}

function spawnRiver(host, { squadId, originX, originZ }) {
  const ships = [];
  const lanes = 3;
  const laneSpacing = 42;
  const alongSpacing = 38;
  const gate = { x: originX, z: originZ };
  for (let i = 0; i < 12; i++) {
    const lane = i % lanes;
    const row = Math.floor(i / lanes);
    const x = originX - row * alongSpacing;
    const z = originZ + (lane - (lanes - 1) / 2) * laneSpacing;
    const spec = makeEnemySpawnSpec('wasp_swarmer', 1, { x, z }, {
      motive: 'pq140_03',
      engagementTrigger: 'authorized_hostile_spawn',
      zoneId: 'pq140_03',
    });
    spec.rot = 0;
    spec.data = spec.data || {};
    spec.data.ai = spec.data.ai || {};
    spec.data.ai.squadId = squadId;
    spec.data.ai.cohortRecipe = COHORT_RECIPE_RIVER;
    spec.data.ai.cohortGate = { x: gate.x, z: gate.z };
    spec.data.ai.passive = true;
    spec.data.ai.allowPassiveManeuver = false;
    spec.data.ai.forcePlayerTarget = true;
    spec.data.ai.huntPlayer = true;
    spec.data.combat = spec.data.combat || {};
    spec.data.combat.targetId = host.state.playerId;
    spec.data.intent = { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, fire: false };
    ships.push(host.runtime.spawn(spec));
  }
  return ships;
}

function spawnRockWall(host, { x, z }) {
  const rocks = [];
  for (let i = -3; i <= 3; i++) {
    rocks.push(host.spawnObstacle({
      pos: { x, z: z + i * 28 },
      radius: 26,
      mass: 720,
      inertiaY: 280,
      hull: 800,
    }));
  }
  return rocks;
}

function shoveCohort(host, ships, dir) {
  const mag = Math.hypot(dir.x, dir.z) || 1;
  const nx = dir.x / mag;
  const nz = dir.z / mag;
  const impulse = CONCUSSION.impulsePerHit;
  for (const ship of ships) {
    if (!ship || ship.alive === false) continue;
    hitShip(host, ship, {
      damage: CONCUSSION.dmg,
      damageType: CONCUSSION.damageType,
      impulse: { x: nx * impulse, z: nz * impulse },
      tumbleTorque: CONCUSSION.tumbleTorque,
      weaponId: CONCUSSION.id,
      tag: CONCUSSION.impulseProvenance,
    });
  }
}

function pulseHit(host, victim) {
  const dx = victim.pos.x - host.player.pos.x;
  const dz = victim.pos.z - host.player.pos.z;
  const mag = Math.hypot(dx, dz) || 1;
  hitShip(host, victim, {
    damage: PULSE.dmg,
    damageType: PULSE.damageType,
    impulse: { x: (dx / mag) * PULSE.impulsePerHit, z: (dz / mag) * PULSE.impulsePerHit },
    tumbleTorque: PULSE.tumbleTorque,
    weaponId: PULSE.id,
    tag: PULSE.impulseProvenance,
  });
}

function hitShip(host, victim, { damage, damageType, impulse, tumbleTorque, weaponId, tag }) {
  const combatSys = host.runtime.getSystem('combat');
  if (combatSys && typeof combatSys.ensureKernel === 'function') combatSys.ensureKernel();
  const kernel = combatSys && combatSys.kernel;
  if (!kernel || typeof kernel.routeDamage !== 'function') {
    throw new Error('pq140.03: combat.routeDamage missing');
  }
  const apply = () => kernel.routeDamage({
    attackerId: host.player.id,
    targetId: victim.id,
    packet: scalarHitToDamagePacket({
      damage,
      damageType,
      pos: { x: victim.pos.x, z: victim.pos.z },
      impulse,
      tumbleTorque,
      source: { kind: 'weapon', weaponId, impulseProvenance: tag },
    }),
    origin: { kind: 'weapon', id: weaponId, weaponId },
  });
  return host.withFeatures(apply);
}

function nearestLive(ships, player) {
  let best = null;
  let bestD = Infinity;
  for (const ship of ships) {
    if (!ship || ship.alive === false) continue;
    if (Number.isFinite(ship.hull) && ship.hull <= 0) continue;
    const d = Math.hypot(ship.pos.x - player.pos.x, ship.pos.z - player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = ship;
    }
  }
  return best;
}

function parkPlayer(player) {
  const data = player.data || (player.data = {});
  const intent = data.intent || (data.intent = {});
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.turnIntent = 0;
  intent.boost = false;
  intent.brake = false;
  intent.fire = false;
}

function centroidX(ships) {
  const live = ships.filter((e) => e && e.alive !== false);
  if (!live.length) return 0;
  return live.reduce((s, e) => s + e.pos.x, 0) / live.length;
}

function centroidZ(ships) {
  const live = ships.filter((e) => e && e.alive !== false);
  if (!live.length) return 0;
  return live.reduce((s, e) => s + e.pos.z, 0) / live.length;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  if (!n) return Infinity;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function formatResolveTable(rows) {
  const lines = [
    'seed   | physics median | guns median | physics kills | guns kills | physics≤guns',
    '-------|----------------|-------------|---------------|------------|-------------',
  ];
  for (const row of rows) {
    const p = Number.isFinite(row.physics.medianS) ? row.physics.medianS.toFixed(3) : 'inf';
    const g = Number.isFinite(row.guns.medianS) ? row.guns.medianS.toFixed(3) : 'inf';
    const ok = Number.isFinite(row.physics.medianS)
      && Number.isFinite(row.guns.medianS)
      && row.physics.medianS <= row.guns.medianS
      ? 'yes'
      : 'NO';
    lines.push(
      `${String(row.seed).padEnd(6)} | ${p.padStart(14)} | ${g.padStart(11)} | `
      + `${String(row.physics.kills).padStart(13)} | ${String(row.guns.kills).padStart(10)} | ${ok}`,
    );
  }
  return lines.join('\n');
}
