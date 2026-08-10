#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { mulberry32 } from '../src/core/rng.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { COLLISION_CONSEQUENCE_LIMITS } from '../src/combat/impulseKernel.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  applyFeatureConfigToMaps,
  PRODUCTION_FEATURES,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { buildWeaponDamagePacket } from '../src/systems/weapons.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const BASELINE_PATH = path.join(
  ROOT,
  'design/program/roadmap/evidence/u11-displacement-ttk-baseline.json',
);

export const TUNED_PATH = path.join(
  ROOT,
  'design/program/roadmap/evidence/u11-displacement-ttk-tuned.json',
);

export const DEFAULT_SEEDS = Object.freeze([
  11001, 11002, 11003, 11004, 11005,
  11006, 11007, 11008, 11009, 11010,
  11011, 11012, 11013, 11014, 11015,
  11016, 11017, 11018, 11019, 11020,
]);

const DT = 1 / 60;
const MAX_TICKS = 60 * 45;
const PLAYER_ID = 1;
const TARGET_ID = 2;
const BYSTANDER_ID = 3;
const ROCK_ID = 90;
const TACTICS = Object.freeze(['GUNFIRE', 'DISPLACEMENT']);
const HULLS = Object.freeze([
  Object.freeze({ class: 'light', enemyTypeId: 'wasp_swarmer' }),
  Object.freeze({ class: 'medium', enemyTypeId: 'reaver_pirate' }),
]);
const GUNFIRE_WEAPON_ID = 'wpn_pulse_laser_s';
const DISPLACEMENT_WEAPON_ID = 'wpn_concussion_cannon_m';

export function buildDisplacementTtkBaseline(options = {}) {
  const sourceCommit = options.sourceCommit || resolveGitCommit();
  const packet = typeof options.packet === 'string' && options.packet
    ? options.packet
    : 'U11-BASELINE';
  const title = typeof options.title === 'string' && options.title
    ? options.title
    : (packet === 'U11-TUNED'
      ? 'displacement-vs-TTK telemetry tuned'
      : 'displacement-vs-TTK telemetry baseline');
  const seeds = Array.isArray(options.seeds) && options.seeds.length
    ? options.seeds.map((seed) => seed >>> 0)
    : [...DEFAULT_SEEDS];
  const previousFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  try {
    const rows = [];
    for (const hull of HULLS) {
      for (const seed of seeds) {
        for (const tactic of TACTICS) {
          rows.push(runScenario({ seed, hull, tactic }));
        }
      }
    }

    const aggregates = aggregateRows(rows);
    return {
      schemaVersion: 1,
      packet,
      title,
      environment: {
        sourceCommit,
        generatedBy: 'scripts/bench-displacement-ttk.mjs',
        node: process.version,
        platform: process.platform,
        runtimeProfile: 'production',
        deterministicClock: { dtS: round(DT), maxTicks: MAX_TICKS, maxSimS: round(MAX_TICKS * DT) },
        seedList: seeds,
        scenarioCount: rows.length,
      },
      scenario: {
        tactics: {
          GUNFIRE: {
            weaponId: GUNFIRE_WEAPON_ID,
            script: 'perfect sustained Pulse Laser S fire until kill or timeout',
          },
          DISPLACEMENT: {
            weaponId: DISPLACEMENT_WEAPON_ID,
            script: 'repeat Concussion Cannon M impulse along the target-to-rock line; terrain contact is emitted only after integrated motion reaches the rock',
          },
        },
        hulls: HULLS.map((entry) => hullStamp(entry)),
        rock: { id: ROCK_ID, type: 'asteroid', radius: 32, mass: 1_000_000 },
        thirdParties: [{ id: BYSTANDER_ID, role: 'collateral sentinel', expectedDamage: 0 }],
        aiIntentSurface: 'scripted target intent is present; collisionConsequences control override is measured after the tick slot where tacticalAI normally writes/revalidates firing intent',
      },
      mechanismNotes: buildMechanismNotes(rows),
      rows,
      aggregates,
      baselineTable: Object.fromEntries(aggregates.map((entry) => [
        `${entry.hullClass}:${entry.tactic}`,
        {
          medianTtkS: entry.medianTtkS,
          p90TtkS: entry.p90TtkS,
          kills: entry.kills,
          survivors: entry.survivors,
          medianInputEffort: entry.medianInputEffort,
        },
      ])),
    };
  } finally {
    restoreFeatureMaps(previousFlags);
  }
}

export function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function writeBaselineFile(filePath = BASELINE_PATH, options = {}) {
  const resolvedPath = path.resolve(filePath);
  const tunedDefaults = path.resolve(TUNED_PATH) === resolvedPath
    ? { packet: 'U11-TUNED', title: 'displacement-vs-TTK telemetry tuned' }
    : {};
  const baseline = buildDisplacementTtkBaseline({ ...tunedDefaults, ...options });
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, stableStringify(baseline));
  return baseline;
}

function runScenario({ seed, hull, tactic }) {
  const rng = mulberry32(seed);
  const enemyDef = enemyById(hull.enemyTypeId);
  const target = enemyEntity(enemyDef, TARGET_ID, {
    x: round(132 + rng() * 24),
    z: round((rng() - 0.5) * 10),
  });
  const player = playerEntity();
  const bystander = sentinelEntity();
  const rock = rockEntity(target, rng);
  const state = {
    tick: 0,
    simTime: 0,
    mode: 'flight',
    playerId: PLAYER_ID,
    player: { targetId: TARGET_ID, tether: { active: false, targetId: null, phase: 'idle' } },
    entities: new Map([
      [player.id, player],
      [target.id, target],
      [bystander.id, bystander],
      [rock.id, rock],
    ]),
    entityList: [player, target, bystander, rock],
    entityIndex: { ships: [player, target, bystander] },
    combat: { beams: [], threatTables: new Map() },
    meta: { seed },
    rng,
    runtime: { features: PRODUCTION_FEATURES },
  };
  const metrics = {
    damage: { weapon: 0, collision: 0, collateral: 0 },
    collisions: [],
    collisionEvents: [],
    deaths: [],
    recoveryWindows: [],
    recoverySurvivals: 0,
    controlSuppressionTicks: 0,
    physicsImpulses: [],
    torqueImpulses: [],
  };
  const bus = createBus();
  const helpers = {
    combatPhysics: {
      applyImpulse(input) {
        const entity = state.entities.get(input && input.entityId);
        if (!entity || entity.alive === false) return false;
        const mass = positive(entity.mass, 1);
        const impulse = input.impulse || {};
        entity.vel.x += finite(impulse.x) / mass;
        entity.vel.z += finite(impulse.z) / mass;
        metrics.physicsImpulses.push({
          tick: state.tick,
          entityId: entity.id,
          reason: input.reason || null,
          magnitude: round(Math.hypot(finite(impulse.x), finite(impulse.z))),
          provenance: input.provenance && input.provenance.tag || null,
        });
        return true;
      },
      applyTorqueImpulse(input) {
        const entity = state.entities.get(input && input.entityId);
        if (!entity || entity.alive === false) return false;
        const inertiaY = positive(entity.data?.physicsBody?.inertiaY, 0.5 * positive(entity.mass, 1) * positive(entity.radius, 1) ** 2);
        const y = finite(input.impulse && input.impulse.y);
        entity.angVel += y / inertiaY;
        metrics.torqueImpulses.push({
          tick: state.tick,
          entityId: entity.id,
          reason: input.reason || null,
          impulseY: round(y),
        });
        return true;
      },
    },
  };
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } }, {
    onKill: (entity, killerId, lethal) => {
      if (entity.alive === false) return;
      entity.alive = false;
      const origin = lethal && lethal.origin || {};
      const source = lethal && lethal.packet && lethal.packet.source || {};
      const collision = source && source.collisionPresentation;
      bus.emit('entity:killed', {
        id: entity.id,
        killerId,
        type: entity.type,
        pos: { x: entity.pos.x, z: entity.pos.z },
        cause: origin.kind === 'collision'
          ? `collision_${collision && collision.surface || origin.id || 'unknown'}`
          : origin.kind || source.kind || 'unknown',
        weaponId: origin.weaponId || origin.id || source.weaponId || null,
      });
    },
  });
  const registry = { get: (name) => (name === 'combat' ? { kernel } : null) };
  const consequences = Object.create(collisionConsequences);
  consequences.init({ state, bus, registry, helpers });
  const unsubs = [
    bus.on('combat:damage', (payload) => {
      const applied = finite(payload && payload.applied);
      const originKind = payload && payload.origin && payload.origin.kind || null;
      if (payload && payload.targetId === TARGET_ID) {
        if (originKind === 'collision') metrics.damage.collision += applied;
        else metrics.damage.weapon += applied;
      } else if (payload && payload.targetId !== PLAYER_ID) {
        metrics.damage.collateral += applied;
      }
    }),
    bus.on('combat:collisionConsequence', (receipt) => {
      const event = {
        tick: receipt.tick,
        surface: receipt.surface,
        control: receipt.control,
        deltaV: round(receipt.deltaV),
        impactDamage: round(receipt.impactDamage),
        targetId: receipt.targetId,
      };
      metrics.collisionEvents.push(event);
      if (receipt.targetId === TARGET_ID && receipt.control === 'tumble') {
        metrics.recoveryWindows.push({
          endTick: receipt.tick + receipt.staggerTicks,
          recorded: false,
        });
      }
    }),
    bus.on('entity:killed', (payload) => metrics.deaths.push({ ...payload })),
  ];

  let nextActionTick = 0;
  let actionCount = 0;
  let shotsFired = 0;
  let killTick = null;
  const weaponId = tactic === 'GUNFIRE' ? GUNFIRE_WEAPON_ID : DISPLACEMENT_WEAPON_ID;
  const weapon = weaponById(weaponId);
  const shotIntervalTicks = Math.max(1, Math.round(60 / positive(weapon.rof, 1)));

  for (let tick = 0; tick <= MAX_TICKS; tick++) {
    state.tick = tick;
    state.simTime = tick * DT;
    kernel.prePhysics(DT);
    consequences.update(DT, state);

    if (target.alive !== false && tick >= nextActionTick) {
      const fired = routeScriptedShot({ state, kernel, target, weapon, tactic });
      if (fired) {
        actionCount++;
        shotsFired++;
        nextActionTick = tick + shotIntervalTicks;
      }
    }

    integratePhysics(state, metrics);
    emitTerrainContactIfNeeded({ state, bus, target, rock, metrics });
    bus.flush();
    kernel.postPhysics();
    for (const window of metrics.recoveryWindows) {
      if (!window.recorded && tick >= window.endTick) {
        window.recorded = true;
        if (target.alive !== false) metrics.recoverySurvivals++;
      }
    }
    if (target.alive === false) {
      killTick = tick;
      break;
    }
  }

  for (const off of unsubs) off();
  consequences.destroy();
  bus.clear();

  const death = metrics.deaths.find((entry) => entry.id === TARGET_ID) || null;
  const killed = target.alive === false;
  const collisionDamage = round(metrics.damage.collision);
  const weaponDamage = round(metrics.damage.weapon);
  const firstTerrain = metrics.collisions.find((entry) => entry.targetId === TARGET_ID) || null;
  const notes = [];
  if (!killed) notes.push('target_survived_timeout');
  if (killed && death && !String(death.cause || '').startsWith('collision_')) {
    notes.push('kill_attributed_to_direct_weapon_damage_before_collision_finished_target');
  }
  if (tactic === 'DISPLACEMENT' && firstTerrain && collisionDamage < target.data.initialEffectiveHp) {
    notes.push('terrain_collision_damage_contributed_but_did_not_by_itself_cover_initial_effective_hp');
  }

  return {
    seed,
    hullClass: hull.class,
    hullArchetype: enemyDef.id,
    tactic,
    killed,
    ttkS: killed ? round(killTick * DT) : null,
    inputEffort: actionCount,
    shotsFired,
    collisions: metrics.collisions.length,
    terrainCollisionDamage: collisionDamage,
    directWeaponDamage: weaponDamage,
    collateralDamage: round(metrics.damage.collateral),
    escapeRecoveryEvents: metrics.recoverySurvivals,
    controlSuppressionTicks: metrics.controlSuppressionTicks,
    firstTerrainImpact: firstTerrain
      ? {
        tick: firstTerrain.tick,
        simTimeS: round(firstTerrain.tick * DT),
        speed: firstTerrain.speed,
        exchangedMomentum: firstTerrain.exchangedMomentum,
      }
      : null,
    kill: death
      ? { cause: death.cause, killerId: death.killerId, weaponId: death.weaponId }
      : null,
    final: {
      hull: round(target.hull),
      armor: round(target.armorHp),
      shield: round(target.shield),
      speed: round(Math.hypot(target.vel.x, target.vel.z)),
      x: round(target.pos.x),
      z: round(target.pos.z),
    },
    notes,
  };
}

function routeScriptedShot({ state, kernel, target, weapon, tactic }) {
  if (!target || target.alive === false) return false;
  const hitPos = {
    x: target.pos.x - target.radius * 0.65,
    z: target.pos.z + (tactic === 'DISPLACEMENT' ? target.radius * 0.5 : 0),
  };
  const packet = buildWeaponDamagePacket(
    { defId: weapon.id },
    weapon,
    weapon.dmg,
    weapon.damageType,
    hitPos,
  );
  packet.hit = {
    ...(packet.hit || {}),
    pos: hitPos,
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
  };
  kernel.routeDamage({
    attackerId: PLAYER_ID,
    targetId: TARGET_ID,
    packet,
    origin: { kind: 'weapon', id: weapon.id, weaponId: weapon.id },
  });
  return true;
}

function integratePhysics(state, metrics) {
  for (const entity of state.entityList) {
    if (!entity || entity.alive === false || !entity.vel) continue;
    const command = consumePhysicsCommand(entity);
    if (command) {
      for (const impulse of command.torqueImpulses || []) {
        const inertiaY = positive(entity.data?.physicsBody?.inertiaY, 0.5 * positive(entity.mass, 1) * positive(entity.radius, 1) ** 2);
        entity.angVel += finite(impulse.y) / inertiaY;
      }
      const mode = command.control && command.control.mode || '';
      if (mode === 'collision_stagger' || mode === 'collision_tumble' || mode === 'tumbling') {
        entity.data.lastControlSuppressedTick = state.tick;
        if (metrics && entity.id === TARGET_ID) metrics.controlSuppressionTicks++;
      }
    }
    entity.pos.x += finite(entity.vel.x) * DT;
    entity.pos.z += finite(entity.vel.z) * DT;
    entity.angVel *= 0.992;
    entity.rot += finite(entity.angVel) * DT;
  }
}

function emitTerrainContactIfNeeded({ state, bus, target, rock, metrics }) {
  if (!target || target.alive === false || !rock) return;
  const surfaceX = rock.pos.x - rock.radius - target.radius;
  if (target.pos.x < surfaceX || target.vel.x <= 0) return;
  const speed = Math.hypot(target.vel.x - rock.vel.x, target.vel.z - rock.vel.z);
  const exchangedMomentum = positive(target.mass, 1) * speed;
  target.pos.x = surfaceX - 0.01;
  target.vel.x = -target.vel.x * 0.35;
  target.vel.z *= 0.35;
  const receipt = {
    tick: state.tick,
    targetId: target.id,
    speed: round(speed),
    exchangedMomentum: round(exchangedMomentum),
  };
  metrics.collisions.push(receipt);
  bus.emit('physics:impact', {
    consequenceKernelVersion: 1,
    backend: 'u11-headless-port',
    tick: state.tick,
    aId: target.id,
    bId: rock.id,
    impulse: exchangedMomentum,
    dp: exchangedMomentum,
    pos: { x: surfaceX, z: target.pos.z },
    normal: { x: -1, z: 0 },
  });
}

function aggregateRows(rows) {
  const groups = [];
  for (const hull of HULLS) {
    for (const tactic of TACTICS) {
      const subset = rows.filter((row) => row.hullClass === hull.class && row.tactic === tactic);
      const killed = subset.filter((row) => row.killed);
      const ttk = killed.map((row) => row.ttkS);
      groups.push({
        hullClass: hull.class,
        tactic,
        runs: subset.length,
        kills: killed.length,
        survivors: subset.length - killed.length,
        medianTtkS: percentile(ttk, 0.5),
        p90TtkS: percentile(ttk, 0.9),
        medianInputEffort: percentile(subset.map((row) => row.inputEffort), 0.5),
        p90InputEffort: percentile(subset.map((row) => row.inputEffort), 0.9),
        meanCollisionDamage: mean(subset.map((row) => row.terrainCollisionDamage)),
        meanDirectWeaponDamage: mean(subset.map((row) => row.directWeaponDamage)),
        escapeRecoveryEvents: subset.reduce((sum, row) => sum + row.escapeRecoveryEvents, 0),
        collateralDamage: round(subset.reduce((sum, row) => sum + row.collateralDamage, 0)),
        killCauseCounts: countBy(killed.map((row) => row.kill && row.kill.cause || 'survived')),
        outcomeVariance: {
          ttkStddevS: stddev(ttk),
          inputEffortStddev: stddev(subset.map((row) => row.inputEffort)),
          killRate: round(killed.length / Math.max(1, subset.length)),
        },
      });
    }
  }
  return groups;
}

function buildMechanismNotes(rows) {
  const displacementRows = rows.filter((row) => row.tactic === 'DISPLACEMENT');
  const collisionKills = displacementRows.filter((row) => row.kill && String(row.kill.cause || '').startsWith('collision_')).length;
  const weaponKills = displacementRows.filter((row) => row.kill && row.kill.cause === 'weapon').length;
  const survivors = displacementRows.filter((row) => !row.killed).length;
  const concussion = weaponById(DISPLACEMENT_WEAPON_ID);
  return [
    {
      id: 'collision_damage_cap',
      finding: `Terrain collision damage is capped at ${COLLISION_CONSEQUENCE_LIMITS.maxDamage} per consequence and only begins above deltaV ${COLLISION_CONSEQUENCE_LIMITS.damageDeltaV}.`,
      refs: [
        'src/combat/impulseKernel.js:18',
        'src/combat/impulseKernel.js:20',
        'src/combat/impulseKernel.js:126',
        'src/combat/impulseKernel.js:135',
      ],
    },
    {
      id: 'concussion_impulse_budget',
      finding: `Concussion Cannon M supplies ${concussion.impulsePerHit} momentum per hit: about ${round(concussion.impulsePerHit / enemyById('wasp_swarmer').mass)} wu/s on the light hull and ${round(concussion.impulsePerHit / enemyById('reaver_pirate').mass)} wu/s on the medium hull before contact response.`,
      refs: ['src/data/weapons.js:185', 'src/data/weapons.js:189', 'src/data/weapons.js:190'],
    },
    {
      id: 'kill_attribution_summary',
      finding: `Across displacement runs: ${collisionKills} collision-attributed kills, ${weaponKills} direct-weapon-attributed kills, ${survivors} survivals.`,
      refs: ['src/systems/collisionConsequences.js:202', 'src/combat/damage.js:275'],
    },
    {
      id: 'ai_recovery_surface',
      finding: 'The headless target does not run the full tacticalAI stack; it exposes the same mutable intent surface and measures collisionConsequences overriding fire/move intent after the tacticalAI slot would normally write or revalidate it.',
      refs: [
        'src/systems/tacticalAI.js:123',
        'src/systems/tacticalAI.js:165',
        'src/systems/collisionConsequences.js:90',
        'src/systems/collisionConsequences.js:91',
      ],
    },
  ];
}

function hullStamp(entry) {
  const def = enemyById(entry.enemyTypeId);
  return {
    class: entry.class,
    enemyTypeId: def.id,
    hull: def.hull,
    armor: def.armor,
    armorFlat: def.armorFlat || 0,
    shield: def.shield,
    mass: def.mass,
    radius: def.collisionRadius,
  };
}

function enemyEntity(def, id, pos) {
  const radius = positive(def.collisionRadius, 12);
  const mass = positive(def.mass, 16);
  const entity = {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    factionId: def.factionId || 'faction_reach',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius,
    mass,
    hull: def.hull,
    hullMax: def.hull,
    armorHp: def.armor,
    armorMax: def.armor,
    armorFlat: def.armorFlat || 0,
    shield: def.shield,
    shieldMax: def.shield,
    cap: def.cap || 100,
    capMax: def.cap || 100,
    capRegen: def.capRegen || 0,
    flags: {},
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      derived: { damageReductionMult: 1 },
      physicsBody: { mass, radius, inertiaY: 0.5 * mass * radius * radius },
      shipClass: def.shipClass || 'fighter',
      ai: {
        archetype: def.aiArchetype || 'pirate',
        lawful: false,
        motive: 'u11_measurement',
        engagementTrigger: 'u11_measurement',
      },
      intent: { fire: true, moveX: 1, moveZ: 0, boost: false, brake: false },
      initialEffectiveHp: def.hull + def.armor + def.shield,
    },
  };
  return entity;
}

function playerEntity() {
  return {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_player',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 16,
    mass: 80,
    hull: 500,
    hullMax: 500,
    armorHp: 100,
    armorMax: 100,
    armorFlat: 2,
    shield: 120,
    shieldMax: 120,
    cap: 200,
    capMax: 200,
    flags: {},
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      derived: { damageReductionMult: 1 },
      physicsBody: { mass: 80, radius: 16, inertiaY: 10_240 },
    },
  };
}

function sentinelEntity() {
  return {
    id: BYSTANDER_ID,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 260, z: 240 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 18,
    mass: 60,
    hull: 120,
    hullMax: 120,
    armorHp: 30,
    armorMax: 30,
    armorFlat: 1,
    shield: 50,
    shieldMax: 50,
    cap: 100,
    capMax: 100,
    flags: {},
    data: { combatProfileId: 'combat_profile_standard_ship', derived: { damageReductionMult: 1 } },
  };
}

function rockEntity(target, rng) {
  const radius = 32;
  const gap = 50 + rng() * 28;
  return {
    id: ROCK_ID,
    type: 'asteroid',
    alive: true,
    collides: true,
    pos: { x: round(target.pos.x + target.radius + radius + gap), z: target.pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius,
    mass: 1_000_000,
    flags: {},
    data: {},
  };
}

function enemyById(id) {
  const found = ENEMY_TYPES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing enemy type ${id}`);
  return found;
}

function weaponById(id) {
  const found = WEAPONS.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing weapon ${id}`);
  return found;
}

function percentile(values, p) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const idx = Math.min(xs.length - 1, Math.max(0, Math.ceil(xs.length * p) - 1));
  return round(xs[idx]);
}

function mean(values) {
  const xs = values.filter(Number.isFinite);
  if (!xs.length) return null;
  return round(xs.reduce((sum, value) => sum + value, 0) / xs.length);
}

function stddev(values) {
  const xs = values.filter(Number.isFinite);
  if (xs.length < 2) return 0;
  const avg = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const variance = xs.reduce((sum, value) => sum + (value - avg) ** 2, 0) / xs.length;
  return round(Math.sqrt(variance));
}

function countBy(values) {
  const out = {};
  for (const value of values) out[value] = (out[value] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function resolveGitCommit() {
  try {
    return String(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })).trim();
  } catch {
    return 'unknown';
  }
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function readOption(name) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const writeTarget = process.argv.includes('--write')
    ? (readOption('--out') || BASELINE_PATH)
    : null;
  const sourceCommit = readOption('--source-commit') || undefined;
  const baseline = writeTarget
    ? writeBaselineFile(path.resolve(ROOT, writeTarget), { sourceCommit })
    : buildDisplacementTtkBaseline({ sourceCommit });
  if (process.argv.includes('--check')) {
    const expectedPath = path.resolve(ROOT, readOption('--expected') || BASELINE_PATH);
    const expected = readFileSync(expectedPath, 'utf8');
    const expectedDefaults = path.resolve(expectedPath) === path.resolve(ROOT, TUNED_PATH)
      ? { packet: 'U11-TUNED', title: 'displacement-vs-TTK telemetry tuned' }
      : {};
    const actual = stableStringify(buildDisplacementTtkBaseline({
      ...expectedDefaults,
      sourceCommit: JSON.parse(expected).environment.sourceCommit,
    }));
    if (actual !== expected) {
      console.error(`U11 displacement TTK baseline drifted from ${path.relative(ROOT, expectedPath)}`);
      process.exit(1);
    }
  } else if (!writeTarget) {
    process.stdout.write(stableStringify(baseline));
  }
}
