// One arena bout on the authoritative runtime. Policies only emit intents.
// Motion goes through aiManeuver, shots through engagement authority, repair through
// repairSubsystem, and lines through the physics attachment owner.

import { createCombatCatalog, ensureCombatant } from '../../src/combat/runtime.js';
import { readPhysicsTelemetry } from '../../src/core/physicsAuthority.js';
import { getCombatKernel } from '../../src/combat/kernel.js';
import { counterplayDoctrineById } from '../../src/ai/counterplay/catalog.js';
import {
  applyCounterplayIntent,
  applyCounterplayRepair,
  createCounterplayMemory,
  decideCounterplay,
  restoreCounterplayMemory,
  serializeCounterplayMemory,
} from '../../src/ai/counterplay/index.js';
import { aiPorts } from '../../src/systems/aiPorts.js';
import { collisionConsequences } from '../../src/systems/collisionConsequences.js';
import { combat } from '../../src/systems/combat.js';
import { flightV3 } from '../../src/systems/flightV3.js';
import { weapons } from '../../src/systems/weapons.js';
import {
  OPEN_SPACE_BOUNDS,
  bootArena,
  realPathProof,
  tacticalAiModuleEvaluated,
  writeRealPathInput,
} from './boot.mjs';
import { steerToward } from '../../src/ai/counterplay/steer.js';
import { idleManeuver, pilotIntent } from './pilots.mjs';
import { buildCounterplayScene } from './scenes.mjs';

const ARENA_SYSTEMS = Object.freeze([
  flightV3,
  aiPorts,
  weapons,
  combat,
  collisionConsequences,
]);

export const ARENA_SYSTEM_NAMES = Object.freeze([
  'flightV3',
  'aiPorts',
  'weapons',
  'combat',
  'collisionConsequences',
  'physics',
]);

const REPAIR_CATALOG = createCombatCatalog();

export async function runCounterplayScenario(options = {}) {
  const scene = options.scene || buildCounterplayScene(options.doctrineId, options);
  const doctrine = counterplayDoctrineById(scene.doctrineId);
  const host = await bootArena({
    seed: scene.seed,
    systems: ARENA_SYSTEMS,
    bounds: OPEN_SPACE_BOUNDS,
    prepareState({ state }) {
      state.simTime = 700;
      state.mode = 'flight';
    },
    hulls: scene.hulls.map((row) => ({
      hullId: row.hullId,
      pos: row.pos,
      rot: row.rot,
      isPlayer: row.isPlayer,
      team: row.team,
      fittings: row.fittings,
    })),
  });
  const actors = new Map();
  try {
    scene.hulls.forEach((row, index) => {
      const entity = host.hulls[index];
      actors.set(row.role, entity);
      tag(entity, row.role);
    });
    for (const row of scene.rocks) {
      const entity = host.spawnObstacle({
        pos: row.pos,
        radius: row.radius,
        mass: row.mass,
        dynamic: row.dynamic,
        vel: row.vel,
        hull: row.hull,
        data: { counterplayRole: row.role, combatProfileId: 'combat_profile_tether_anchor' },
      });
      tag(entity, row.role);
      actors.set(row.role, entity);
    }
    host.step(1);
    for (const row of scene.hulls) setPlanarVelocity(host, actors.get(row.role), row.vel);
    for (const row of scene.rocks) setPlanarVelocity(host, actors.get(row.role), row.vel);
    const tethers = [];
    for (const spec of scene.initialTethers || []) {
      latch(host, tethers, actors.get(spec.ownerRole), actors.get(spec.targetRole), 'orbit', 1, host.state.tick | 0, spec.restLength);
    }
    const player = actors.get('player');
    const opponent = actors.get('opponent');
    stampDoctrine(opponent, doctrine, player && player.id);
    if (doctrine.fires && player) {
      player.shield = 0;
      player.shieldRegenRate = 0;
    }
    const patient = actors.get('patient');
    const driveStart = patient ? woundDrive(host.state, patient) : null;
    const vitalStart = vital(player);
    const memory = createCounterplayMemory(doctrine.id);
    const stats = freshStats(scene, opponent, patient, actors);
    stats.driveStart = driveStart;
    stats.vitalStart = vitalStart;
    let lastPhase = '';
    const reloadAt = Number.isInteger(options.reloadAtTick) ? options.reloadAtTick : -1;

    for (let n = 0; n < scene.ticks; n += 1) {
      const tick = host.state.tick | 0;
      if (tick === reloadAt) {
        const restored = restoreCounterplayMemory(serializeCounterplayMemory(memory), doctrine.id);
        Object.assign(memory, restored);
      }
      refreshTetherLengths(tethers, actors);
      const self = bodyOf(opponent, 'opponent');
      const decision = decideCounterplay({
        doctrineId: doctrine.id,
        tick,
        self,
        contacts: contactsOf(actors, opponent.id),
        obstacles: obstaclesOf(actors),
        tethers: tethers.map(publicTether),
        objective: scene.objective,
        memory,
      });
      publish(opponent, decision);
      if (decision.phase !== lastPhase) {
        stats.phases.push(decision.phase);
        lastPhase = decision.phase;
      }
      if (decision.phase === 'feint' && scene.objective && scene.objective.feint && opponent) {
        const feintDist = dist(opponent.pos, scene.objective.feint);
        if (stats.feintStart == null) stats.feintStart = feintDist;
        stats.feintMin = stats.feintMin == null ? feintDist : Math.min(stats.feintMin, feintDist);
      }
      if (decision.telegraph && decision.telegraph.readable) stats.telegraphTicks += 1;
      if (decision.cue && decision.cue.predicted && !stats.predicted) {
        stats.predicted = { x: decision.cue.predicted.x, z: decision.cue.predicted.z };
        stats.predictTick = decision.cue.untilTick;
      }
      const pilot = pilotIntent(scene.pilotId, {
        tick,
        player,
        actors,
        scene,
        tethers,
      });
      applyVerb(host, tethers, decision.verb, actors, tick, opponent, host.state);
      applyVerb(host, tethers, pilot.verb, actors, tick, player, host.state);
      const target = decision.attack ? findById(actors, decision.attack.targetId) : null;
      const applied = applyCounterplayIntent({
        state: host.state,
        helpers: host.runtime.getHelpers(),
        entity: opponent,
        decision,
        tick,
        target,
      });
      if (applied.fire.requested) stats.fireRequests += 1;
      if (applied.fire.authorized) stats.fireAuthorized += 1;
      else if (applied.fire.requested) stats.fireDenied += 1;
      if (applied.fire.authorized && doctrine.fires !== true) stats.unexpectedFire += 1;
      for (const companion of decision.companions || []) {
        const mate = actors.get(companion.role);
        if (!mate) continue;
        const maneuver = companion.waypoint
          ? steerToward(mate, companion.waypoint, { arrive: 20, brakeDist: 28, brakeSpeed: 6, boost: false })
          : companion.maneuver;
        if (!maneuver) continue;
        stats.driven.add(companion.role);
        applyCounterplayIntent({
          state: host.state,
          helpers: host.runtime.getHelpers(),
          entity: mate,
          decision: {
            doctrineId: doctrine.id,
            phase: 'companion',
            maneuver,
            attack: null,
          },
          tick,
          target: null,
        });
      }
      for (const [role, entity] of actors) {
        if (role === 'opponent' || role === 'player' || stats.driven.has(role)) continue;
        if (!entity || entity.type !== 'ship') continue;
        const tethered = tethers.some((row) => row.ownerId === entity.id || row.targetId === entity.id);
        applyCounterplayIntent({
          state: host.state,
          helpers: host.runtime.getHelpers(),
          entity,
          decision: {
            doctrineId: doctrine.id,
            phase: 'idle',
            maneuver: idleManeuver(role, tethered),
            attack: null,
          },
          tick,
          target: null,
        });
      }
      if (decision.attack && decision.attack.wantFire && Number.isFinite(decision.attack.aimAngle)) {
        opponent.rot = decision.attack.aimAngle;
        opponent.angVel = 0;
      }
      writeRealPathInput(host.state, pilot);
      if (stats.predictTick != null && stats.hunterAt == null && tick >= stats.predictTick) {
        stats.hunterAt = dist(opponent.pos, stats.predicted);
        const body = actors.get('orbit_body');
        stats.bodyAt = body ? dist(body.pos, stats.predicted) : null;
      }
      host.step(1);
      refreshTetherLengths(tethers, actors);
      noteExtras(stats, actors, scene, tethers);
      const list = host.state.entityList;
      if (list) {
        let proj = 0;
        for (const entity of list) if (entity && entity.type === 'projectile') proj += 1;
        if (proj > (stats.projectiles || 0)) stats.projectiles = proj;
      }
    }

    stats.driveEnd = readDrive(host.state, patient);
    stats.vitalEnd = vital(player);
    stats.tetherRoles = tethers.map((row) => row.role);
    const score = scoreBout(doctrine.id, scene, stats, actors);
    const proof = realPathProof(host.runtime);
    const receipt = {
      schema: 'spaceface.counterplay.receipt.v1',
      seed: scene.seed,
      doctrineId: doctrine.id,
      pilotId: scene.pilotId,
      mass: scene.mass,
      range: scene.range,
      terrain: scene.terrain,
      tape: scene.tape,
      ticks: scene.ticks,
      hullId: scene.hullId,
      silhouette: scene.silhouette,
      telegraphKind: doctrine.telegraphKind,
      phaseTrace: stats.phases.join('>'),
      telegraphTicks: stats.telegraphTicks,
      fireRequests: stats.fireRequests,
      fireAuthorized: stats.fireAuthorized,
      fireDenied: stats.fireDenied,
      unexpectedFire: stats.unexpectedFire,
      goalProgress: round3(score.progress),
      goalComplete: score.complete === true,
      engagementTicks: scene.ticks,
      playerDamage: round3(Math.max(0, stats.vitalStart - (stats.vitalMin == null ? stats.vitalEnd : Math.min(stats.vitalMin, stats.vitalEnd)))),
      projectiles: stats.projectiles || 0,
      playerShift: round3(stats.playerShift),
      opponentPath: round3(stats.opponentPath),
      driveDelta: stats.driveStart == null || stats.driveEnd == null ? null : round3(stats.driveEnd - stats.driveStart),
      detail: score.detail,
      systems: ARENA_SYSTEM_NAMES,
      tacticalAI: tacticalAiModuleEvaluated(),
      physicsBackend: proof.backend,
      sg02Ready: proof.sg02Ready === true,
      end: endPose(actors),
    };
    receipt.opponentWeapons = opponent && opponent.data && Array.isArray(opponent.data.weapons)
      ? opponent.data.weapons.length
      : 0;
    receipt.hash = hashReceipt(receipt);
    if (opponent && readPhysicsTelemetry(opponent) == null) receipt.sg02Ready = false;
    return receipt;
  } finally {
    host.dispose();
  }
}

function tag(entity, role) {
  if (!entity) return;
  const data = entity.data || (entity.data = {});
  data.counterplayRole = role;
  if (!Number.isInteger(data.counterplayGeneration)) data.counterplayGeneration = 1;
}

function stampDoctrine(entity, doctrine, playerId) {
  if (!entity) return;
  const data = entity.data || (entity.data = {});
  data.ai = {
    passive: false,
    roe: doctrine.roe,
    motive: doctrine.motive,
    engagementTrigger: doctrine.fires ? 'player_attack' : 'conditional_job',
    zoneId: 'counterplay_arena',
    approachTelegraph: doctrine.telegraphKind,
    noFireResponseWindowS: 1,
    counterplayDoctrineId: doctrine.id,
    activity: {
      kind: doctrine.fires ? 'attack_run' : 'transit',
      reason: `counterplay:${doctrine.id}`,
      startedTick: 0,
      targetId: doctrine.fires ? playerId : null,
      anchor: { x: 0, z: 0 },
      leashRadius: 8000,
    },
  };
  if (doctrine.fires) {
    data.ai.combatDoctrineId = doctrine.legalFireDoctrineId;
    data.ai.hostileTeams = [0];
    data.ai.huntPlayer = true;
  }
  data.intent = { fire: false, aimAngle: entity.rot || 0 };
  data.combat = data.combat || { targetId: null, lockTarget: null, lockProgress: 0 };
  if (doctrine.fires && playerId != null) data.combat.targetId = playerId;
}

function woundDrive(state, patient) {
  const runtime = ensureCombatant(state, patient, REPAIR_CATALOG);
  const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
  if (!drive) return null;
  drive.health = Math.min(drive.health, 8);
  return drive.health;
}

function readDrive(state, patient) {
  if (!patient || !state.combat || !state.combat.entities) return null;
  const runtime = state.combat.entities[String(patient.id)];
  const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
  return drive ? drive.health : null;
}

function vital(entity) {
  if (!entity) return 0;
  return (Number(entity.hull) || 0) + (Number(entity.shield) || 0);
}

function bodyOf(entity, role) {
  if (!entity) return null;
  return {
    id: entity.id,
    generation: entity.data && entity.data.counterplayGeneration || 1,
    kind: entity.type === 'ship' ? 'ship' : 'body',
    role,
    team: entity.team == null ? null : entity.team,
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: entity.vel && entity.vel.x || 0, z: entity.vel && entity.vel.z || 0 },
    rot: entity.rot || 0,
    radius: entity.collisionRadius || entity.radius || 12,
    alive: entity.alive !== false,
    hull: Number(entity.hull) || 0,
    shield: Number(entity.shield) || 0,
  };
}

function contactsOf(actors, selfId) {
  const rows = [];
  for (const [role, entity] of actors) {
    if (!entity || entity.id === selfId) continue;
    if (role === 'anchor' || role === 'cover' || role === 'buoy' || role === 'terrain_cover' || role === 'terrain_a' || role === 'terrain_b' || role === 'orbit_anchor') {
      continue;
    }
    rows.push(bodyOf(entity, role));
  }
  return rows;
}

function obstaclesOf(actors) {
  const rows = [];
  for (const role of ['anchor', 'cover', 'orbit_anchor', 'terrain_cover', 'terrain_a', 'terrain_b', 'buoy']) {
    const entity = actors.get(role);
    if (entity) rows.push(bodyOf(entity, role));
  }
  return rows;
}

function publicTether(tether) {
  return {
    id: tether.id,
    ownerId: tether.ownerId,
    targetId: tether.targetId,
    length: tether.length || tether.restLength || 0,
    restLength: tether.restLength || 0,
  };
}

function refreshTetherLengths(tethers, actors) {
  const byId = new Map();
  for (const entity of actors.values()) if (entity) byId.set(entity.id, entity);
  for (const tether of tethers) {
    const a = byId.get(tether.ownerId);
    const b = byId.get(tether.targetId);
    tether.length = a && b ? dist(a.pos, b.pos) : tether.length || 0;
  }
}

function latch(host, tethers, owner, target, role, restScale, tick, restLength) {
  if (!owner || !target || owner.id === target.id) return false;
  if (tethers.some((row) => row.ownerId === owner.id && row.targetId === target.id)) return true;
  const length = dist(owner.pos, target.pos);
  const rest = Number.isFinite(restLength) ? restLength : Math.max(18, length * (restScale || 1));
  const kernel = getCombatKernel({ state: host.state, bus: host.bus, helpers: host.runtime.getHelpers() });
  const result = kernel.attachments.create({
    defId: 'attachment_massline',
    ownerId: owner.id,
    targetId: target.id,
    sourceWorld: { x: owner.pos.x, y: 0, z: owner.pos.z },
    targetWorld: { x: target.pos.x, y: 0, z: target.pos.z },
  });
  if (!result.ok) return false;
  const id = result.attachment.id;
  if (Math.abs(rest - result.attachment.restLength) > 0.01) kernel.attachments.reel(id, rest - result.attachment.restLength, 18);
  tethers.push({
    id,
    ownerId: owner.id,
    targetId: target.id,
    role,
    restLength: rest,
    length,
  });
  return true;
}

function cutRole(host, tethers, role, tick) {
  const kernel = getCombatKernel({ state: host.state, bus: host.bus, helpers: host.runtime.getHelpers() });
  let removed = 0;
  for (let i = tethers.length - 1; i >= 0; i -= 1) {
    if (role && tethers[i].role !== role) continue;
    const result = kernel.attachments.cut(tethers[i].id, null, 'pilot_cut');
    if (result.ok) {
      tethers.splice(i, 1);
      removed += 1;
    }
  }
  return removed;
}

function applyVerb(host, tethers, verb, actors, tick, fallbackOwner, state) {
  if (!verb) return;
  if (verb.kind === 'latch') {
    const owner = (verb.ownerRole && actors.get(verb.ownerRole)) || fallbackOwner;
    const target = actors.get(verb.targetRole);
    if (!owner || !target) return;
    if (dist(owner.pos, target.pos) > (verb.maxRange || 180)) return;
    const role = verb.targetRole === 'orbit_anchor' ? 'orbit' : verb.targetRole;
    latch(host, tethers, owner, target, role, verb.restScale, tick, verb.restLength);
    return;
  }
  if (verb.kind === 'cut') {
    cutRole(host, tethers, verb.tetherRole || null, tick);
    return;
  }
  if (verb.kind === 'repair') {
    const patient = actors.get(verb.targetRole || 'patient');
    applyCounterplayRepair({
      state,
      patient,
      amount: Number.isFinite(verb.amount) ? verb.amount : 0.25,
    });
  }
}

function findById(actors, id) {
  if (id == null) return null;
  for (const entity of actors.values()) {
    if (entity && entity.id === id) return entity;
  }
  return null;
}

function publish(entity, decision) {
  if (!entity) return;
  const data = entity.data || (entity.data = {});
  data.counterplay = {
    doctrineId: decision.doctrineId,
    phase: decision.phase,
    telegraph: decision.telegraph,
    cue: decision.cue,
    explain: decision.explain,
    fallback: decision.fallback,
  };
}

function setPlanarVelocity(host, entity, vel) {
  if (!entity || !vel) return;
  if (!entity.vel) entity.vel = { x: 0, y: 0, z: 0 };
  entity.vel.x = vel.x || 0;
  entity.vel.z = vel.z || 0;
  const physics = host.runtime.getSystem('physics');
  const rec = physics && physics._sg02 && physics._sg02.records && physics._sg02.records.get(entity.id);
  if (rec && rec.body && typeof rec.body.setLinvel === 'function') {
    rec.body.setLinvel({ x: entity.vel.x, y: 0, z: entity.vel.z }, true);
  }
}

function freshStats(scene, opponent, patient, actors) {
  const gate = scene.objective && scene.objective.gate;
  const exit = scene.objective && scene.objective.exit;
  const flank = scene.objective && scene.objective.flank;
  const packmate = actors.get('packmate');
  return {
    phases: [],
    telegraphTicks: 0,
    fireRequests: 0,
    fireAuthorized: 0,
    fireDenied: 0,
    unexpectedFire: 0,
    driven: new Set(),
    opponentPrev: opponent ? { x: opponent.pos.x, z: opponent.pos.z } : null,
    opponentPath: 0,
    playerStart: actors.get('player') ? { x: actors.get('player').pos.x, z: actors.get('player').pos.z } : { x: 0, z: 0 },
    playerShift: 0,
    minFlank: flank && opponent ? dist(opponent.pos, flank) : null,
    tetherTicks: { anchor: 0, patient: 0, prize: 0, orbit: 0 },
    matchedTicks: 0,
    longTether: false,
    predicted: null,
    predictTick: null,
    hunterAt: null,
    bodyAt: null,
    patientStartDist: patient && gate ? dist(patient.pos, gate) : null,
    packStartDist: packmate && exit ? dist(packmate.pos, exit) : null,
    minPackDist: packmate && exit ? dist(packmate.pos, exit) : null,
    courierStart: opponent && gate ? dist(opponent.pos, gate) : null,
    feintStart: null,
    feintMin: null,
    decoyMin: null,
    driveStart: null,
    driveEnd: null,
    vitalStart: 0,
    vitalMin: null,
    vitalEnd: 0,
  };
}

function noteExtras(stats, actors, scene, tethers) {
  const opponent = actors.get('opponent');
  const player = actors.get('player');
  if (opponent && stats.opponentPrev) {
    stats.opponentPath += dist(opponent.pos, stats.opponentPrev);
    stats.opponentPrev = { x: opponent.pos.x, z: opponent.pos.z };
  }
  if (player) {
    stats.playerShift = dist(player.pos, stats.playerStart);
    const now = (Number(player.hull) || 0) + (Number(player.shield) || 0);
    stats.vitalMin = stats.vitalMin == null ? now : Math.min(stats.vitalMin, now);
  }
  const flank = scene.objective && scene.objective.flank;
  if (flank && opponent) stats.minFlank = Math.min(stats.minFlank ?? Infinity, dist(opponent.pos, flank));
  for (const role of Object.keys(stats.tetherTicks)) {
    if (tethers.some((row) => row.role === role)) stats.tetherTicks[role] += 1;
  }
  const prize = actors.get('prize');
  if (prize && opponent) {
    const slip = Math.hypot((opponent.vel?.x || 0) - (prize.vel?.x || 0), (opponent.vel?.z || 0) - (prize.vel?.z || 0));
    if (dist(opponent.pos, prize.pos) < 50 && slip < 18 && tethers.some((row) => row.role === 'prize')) {
      stats.matchedTicks += 1;
    }
  }
  if (player && opponent && tethers.some((row) => (
    (row.ownerId === player.id || row.targetId === player.id)
    && (row.ownerId === opponent.id || row.targetId === opponent.id)
    && (row.length || 0) > 180
  ))) stats.longTether = true;
  if (player && opponent) {
    const gap = dist(player.pos, opponent.pos);
    stats.decoyMin = stats.decoyMin == null ? gap : Math.min(stats.decoyMin, gap);
  }
  if (player && opponent && scene.objective && scene.objective.gate && dist(opponent.pos, scene.objective.gate) < 90) {
    const gap = dist(player.pos, opponent.pos);
    stats.gateSeparation = stats.gateSeparation == null ? gap : Math.min(stats.gateSeparation, gap);
  }
  const packmate = actors.get('packmate');
  const exit = scene.objective && scene.objective.exit;
  if (packmate && exit) stats.minPackDist = Math.min(stats.minPackDist ?? Infinity, dist(packmate.pos, exit));
}

function scoreBout(id, scene, stats, actors) {
  const opponent = actors.get('opponent');
  if (id === 'cp_heavy_anchor_grappler') {
    const radius = (scene.objective && scene.objective.flankRadius) || 36;
    const lineUp = stats.tetherTicks.anchor > 40;
    const inside = stats.minFlank != null && stats.minFlank <= radius;
    const progress = lineUp ? clamp01(1 - (stats.minFlank || radius * 4) / (radius * 4)) : 0;
    return {
      progress,
      complete: lineUp && inside,
      detail: { minFlank: round3(stats.minFlank), anchorTicks: stats.tetherTicks.anchor, flankRadius: radius },
    };
  }
  if (id === 'cp_feint_break_courier') {
    const gate = scene.objective.gate;
    const end = opponent && gate ? dist(opponent.pos, gate) : 999;
    const arrived = end < 70;
    const caught = arrived && (stats.gateSeparation == null ? 999 : stats.gateSeparation) < 46;
    const progress = clamp01(1 - end / (stats.courierStart || 1)) * (caught ? 0.15 : 1);
    return {
      progress,
      complete: arrived && !caught,
      detail: {
        gateDist: round3(end),
        gateSeparation: round3(stats.gateSeparation),
        feintStart: round3(stats.feintStart),
        feintMin: round3(stats.feintMin),
      },
    };
  }
  if (id === 'cp_corridor_pack_leader') {
    const packmate = actors.get('packmate');
    const exit = scene.objective && scene.objective.exit;
    const end = packmate && exit ? dist(packmate.pos, exit) : 999;
    const progress = clamp01(1 - end / (stats.packStartDist || 1));
    return { progress, complete: end < 48, detail: { exitDist: round3(end) } };
  }
  if (id === 'cp_rescue_tow') {
    const patient = actors.get('patient');
    const gate = scene.objective.gate;
    const end = patient && gate ? dist(patient.pos, gate) : 999;
    const progress = stats.tetherTicks.patient > 5
      ? clamp01(1 - end / (stats.patientStartDist || 1))
      : 0;
    return { progress, complete: end < 50 && stats.tetherTicks.patient > 20, detail: { gateDist: round3(end), towTicks: stats.tetherTicks.patient } };
  }
  if (id === 'cp_prize_runner') {
    const progress = clamp01(stats.matchedTicks / 24);
    return { progress, complete: stats.matchedTicks >= 24, detail: { matchedTicks: stats.matchedTicks } };
  }
  if (id === 'cp_release_orbit_hunter') {
    const hunter = stats.hunterAt == null ? 400 : stats.hunterAt;
    const body = stats.bodyAt == null ? 400 : stats.bodyAt;
    const progress = clamp01(1 - hunter / 90) * clamp01(1 - body / 130);
    return {
      progress,
      complete: hunter < 30 && body < 70,
      detail: { hunterDist: round3(hunter), bodyDist: round3(body) },
    };
  }
  if (id === 'cp_tether_bait_decoy') {
    const end = opponent && actors.get('player') ? dist(opponent.pos, actors.get('player').pos) : 0;
    const progress = stats.longTether ? clamp01(0.45 + end / 400) : clamp01(1 - (stats.decoyMin || end) / 120) * 0.2;
    return { progress, complete: stats.longTether && end > 150, detail: { endDist: round3(end), longTether: stats.longTether, closest: round3(stats.decoyMin) } };
  }
  if (id === 'cp_collateral_hold' || id === 'cp_cover_peel') {
    const damage = Math.max(0, stats.vitalStart - stats.vitalEnd);
    const progress = clamp01(damage / 20);
    return { progress, complete: damage >= 16, detail: { playerDamage: round3(damage), shots: stats.fireAuthorized } };
  }
  const delta = stats.driveStart == null || stats.driveEnd == null ? 0 : stats.driveEnd - stats.driveStart;
  const progress = clamp01(Math.max(0, delta) / 12);
  return { progress, complete: delta >= 12, detail: { driveDelta: round3(delta) } };
}

function endPose(actors) {
  const out = {};
  for (const [role, entity] of actors) {
    if (!entity || !entity.pos) continue;
    out[role] = { x: round3(entity.pos.x), z: round3(entity.pos.z) };
  }
  return out;
}

function dist(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round3(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function hashReceipt(receipt) {
  const text = JSON.stringify({
    seed: receipt.seed,
    doctrineId: receipt.doctrineId,
    pilotId: receipt.pilotId,
    phaseTrace: receipt.phaseTrace,
    goalProgress: receipt.goalProgress,
    fireAuthorized: receipt.fireAuthorized,
    end: receipt.end,
    driveDelta: receipt.driveDelta,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export { noteExtras };
