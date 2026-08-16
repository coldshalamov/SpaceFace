// Plan 20 rare event-setpiece runtimes. The encounter director owns pacing and lifecycle; these
// handlers author the physical cast, observe production combat/physics receipts, and settle only
// after the live bodies prove an outcome. They never write a body's position, velocity, or health
// after spawn. Any later motion crosses SG-02 through weapons, impulse charges, Flight/Massline, or
// contact response.
import { Masks } from '../core/entity.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from './ships.js';

const WARNING_S = 6;
const FALLING_ROCK_CLEAR_SPEED = 3;
const REACTOR_SAFE_DISTANCE = 190;
const REACTOR_CLEAR_DISTANCE = 460;
const PHYSICAL_DEBRIS_MASK = Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE;

function beginWarning(d, live, headline) {
  live.phase = 'warning';
  live.data.revealAt = d.now() + WARNING_S;
  d.emit('news:headline', newsPayload(live, headline, 'warning'));
  d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
}

function newsPayload(live, headline, stage, outcome = null) {
  return {
    kind: 'rare-setpiece',
    headline,
    text: headline,
    stage,
    outcome,
    encounterId: live.id,
    sectorId: live.sectorId,
    zoneId: live.zoneId,
  };
}

function rememberOutcome(state, live, outcome) {
  const story = state.story || (state.story = { flags: {} });
  if (!story.flags || typeof story.flags !== 'object') story.flags = {};
  const events = story.flags.setpieceEvents || (story.flags.setpieceEvents = {});
  events[live.shapeId] = {
    encounterId: live.id,
    outcome,
    sectorId: live.sectorId,
    tick: state.tick | 0,
    at: Number(state.simTime) || 0,
  };
}

function finish(d, live, state, outcome, headline, options = {}) {
  if (!live || live.phase === 'done') return false;
  cleanupListeners(live);
  rememberOutcome(state, live, outcome);
  d.emit('news:headline', newsPayload(live, headline, 'aftermath', outcome));
  if (options.danger) d.dangerImpulse(live, options.danger.kind, options.danger.delta);
  if (options.rep) d.rep(options.rep.factionId, options.rep.delta, options.rep.reason);
  d.resolve(live, outcome, { vars: live.vars });
  return true;
}

function listen(d, live, eventName, handler) {
  if (!d.bus || typeof d.bus.on !== 'function') return;
  const off = d.bus.on(eventName, handler);
  const offs = live.data.runtimeOffs || (live.data.runtimeOffs = []);
  if (typeof off === 'function') offs.push(off);
}

function cleanupListeners(live) {
  const offs = live && live.data && live.data.runtimeOffs;
  if (!Array.isArray(offs)) return;
  while (offs.length) {
    const off = offs.pop();
    if (typeof off === 'function') off();
  }
}

function bindPhysical(d, live, spec, role) {
  const spawnEntity = d.helpers && d.helpers.spawnEntity;
  if (typeof spawnEntity !== 'function') return null;
  const entity = spawnEntity(spec);
  if (!entity || entity.id == null) return null;
  live.ids.push(entity.id);
  live.roles[entity.id] = role;
  return entity;
}

function stationaryStructure(d, live, {
  role,
  pos,
  radius,
  label,
  stationId,
  factionId = 'faction_scn',
}) {
  return bindPhysical(d, live, {
    type: 'station',
    team: 0,
    factionId,
    pos,
    vel: { x: 0, z: 0 },
    radius,
    mass: 1e9,
    hull: 5000,
    hullMax: 5000,
    collisionMask: PHYSICAL_DEBRIS_MASK,
    physicsBody: {
      dynamic: false,
      radius,
      mass: 1e9,
      material: 'station',
      shape: 'ball',
    },
    data: {
      stationId,
      setpieceRole: role,
      scanLabel: label,
      encounterId: live.id,
      tetherable: true,
    },
  }, role);
}

function spawnDebris(d, live, pos, baseVelocity, kind, count = 4, staticTerrain = false) {
  const spawnEntity = d.helpers && d.helpers.spawnEntity;
  if (typeof spawnEntity !== 'function') return [];
  const out = [];
  for (let index = 0; index < count; index++) {
    const angle = (Math.PI * 2 * index / count) + 0.35;
    const radius = 6 + (index % 3) * 2;
    const speed = staticTerrain ? 0 : 3 + index * 0.8;
    const entity = spawnEntity({
      type: 'wreck',
      team: 2,
      pos: {
        x: pos.x + Math.cos(angle) * (radius + 3),
        z: pos.z + Math.sin(angle) * (radius + 3),
      },
      vel: {
        x: staticTerrain ? 0 : (Number(baseVelocity && baseVelocity.x) || 0) * 0.35 + Math.cos(angle) * speed,
        z: staticTerrain ? 0 : (Number(baseVelocity && baseVelocity.z) || 0) * 0.35 + Math.sin(angle) * speed,
      },
      radius,
      mass: 18 + index * 6,
      hull: 80,
      hullMax: 80,
      collides: true,
      collisionMask: PHYSICAL_DEBRIS_MASK,
      physicsBody: {
        dynamic: !staticTerrain,
        radius,
        mass: 18 + index * 6,
        material: 'debris',
        shape: 'ball',
      },
      data: {
        parentType: 'debris',
        majorDebris: !staticTerrain,
        setpieceDebris: kind,
        scanLabel: staticTerrain ? 'Wrecked station module' : 'Setpiece impact debris',
        encounterId: live.id,
        salvagePool: { cmdty_scrap_metal: 2 },
        salvageTimeLeft: 8,
      },
    });
    if (entity) out.push(entity.id);
  }
  return out;
}

function pair(payload, firstId, secondId) {
  return !!payload && ((payload.aId === firstId && payload.bId === secondId)
    || (payload.aId === secondId && payload.bId === firstId));
}

function revealFallingRock(d, live) {
  const station = stationaryStructure(d, live, {
    role: 'station',
    pos: { x: live.anchor.x, z: live.anchor.z },
    radius: 58,
    label: 'Evacuation station',
    stationId: `setpiece-station:${live.id}`,
  });
  const rock = bindPhysical(d, live, {
    type: 'asteroid',
    team: 2,
    pos: { x: live.anchor.x + 460, z: live.anchor.z },
    vel: { x: -12, z: 0 },
    radius: 38,
    mass: 120,
    hull: 5000,
    hullMax: 5000,
    collides: true,
    collisionMask: PHYSICAL_DEBRIS_MASK,
    physicsBody: {
      dynamic: true,
      ccd: true,
      radius: 38,
      mass: 120,
      inertiaY: 86_640,
      material: 'rock',
      shape: 'ball',
    },
    data: {
      isChunk: true,
      tetherPayload: true,
      tetherable: true,
      mineable: true,
      scanLabel: 'Falling Rock — collision course',
      setpieceRole: 'falling_rock',
      encounterId: live.id,
    },
  }, 'falling_rock');
  if (!station || !rock) return false;
  Object.assign(live.data, {
    stationId: station.id,
    rockId: rock.id,
    chargeHits: 0,
    railHits: 0,
    tethered: false,
    towBurnStages: 0,
    impact: null,
    rockChargeIds: [],
  });

  listen(d, live, 'charge:stuck', (payload = {}) => {
    if (payload.hostId === rock.id && payload.chargeId != null
      && !live.data.rockChargeIds.includes(payload.chargeId)) {
      live.data.rockChargeIds.push(payload.chargeId);
    }
  });
  listen(d, live, 'charge:detonated', (payload = {}) => {
    if (Array.isArray(payload.hits) && payload.hits.includes(rock.id)) {
      live.data.chargeHits++;
      return;
    }
    // Stock charge falloff is center-based. A genuinely stuck plate on this unusually large rock
    // can therefore detonate on the surface while its 42-WU sphere misses the centre. Admit that
    // real detonation by surface distance and send the same authored impulse through SG-02.
    const dx = rock.pos.x - Number(payload.pos && payload.pos.x);
    const dz = rock.pos.z - Number(payload.pos && payload.pos.z);
    const distance = Math.hypot(dx, dz);
    const surfaceDistance = Math.max(0, distance - rock.radius);
    if (!Number.isFinite(distance) || surfaceDistance > 42 || !live.data.rockChargeIds.length) return;
    const length = distance || 1;
    const magnitude = 800 * Math.max(0, 1 - surfaceDistance / 42);
    queuePhysicsImpulse(rock, { x: dx / length * magnitude, y: 0, z: dz / length * magnitude });
    live.data.rockChargeIds.shift();
    live.data.chargeHits++;
  });
  listen(d, live, 'projectile:hit', (payload = {}) => {
    if (payload.targetId !== rock.id || payload.ownerId !== d.state.playerId) return;
    if (payload.weaponId !== 'wpn_railgun_m' && payload.weaponId !== 'wpn_siege_lance_l') return;
    const magnitude = Math.max(0, Number(payload.damagePacket?.impulse?.magnitude) || 0);
    if (!(magnitude > 0) || !payload.approach) return;
    queuePhysicsImpulse(rock, {
      x: (Number(payload.approach.x) || 0) * magnitude,
      y: 0,
      z: (Number(payload.approach.z) || 0) * magnitude,
    });
    live.data.railHits++;
  });
  listen(d, live, 'ship:boostStart', (payload = {}) => {
    if (payload.shipId === d.state.playerId && live.data.tethered) live.data.towBurnStages++;
  });
  listen(d, live, 'physics:impact', (payload = {}) => {
    if (pair(payload, rock.id, station.id)) live.data.impact = { ...payload };
  });
  live.phase = 'physical';
  d.emit('setpiece:revealed', { encounterId: live.id, kind: live.shapeId, ids: [station.id, rock.id] });
  return true;
}

const fallingRock = Object.freeze({
  fire(d, live) {
    beginWarning(d, live, 'FREIGHT-BAND WARNING: falling rock on a station collision course');
  },
  tick(d, live, state, now) {
    if (live.phase === 'warning' && now >= live.data.revealAt) {
      if (!revealFallingRock(d, live)) d.abort(live, 'spawn_failed');
      return;
    }
    if (live.phase !== 'physical') return;
    const rock = state.entities.get(live.data.rockId);
    const station = state.entities.get(live.data.stationId);
    if (live.data.impact) {
      const at = live.data.impact.pos || (rock && rock.pos) || live.anchor;
      live.data.debrisIds = spawnDebris(d, live, at, rock && rock.vel, 'falling_rock_impact', 6, false);
      finish(d, live, state, 'rock_hit_station', 'STATION HIT: the broken rock and outer ring are now a salvage field', {
        danger: { kind: 'station_impact', delta: 0.04 },
      });
      return;
    }
    if (!rock || !station || rock.alive === false) return;
    const dx = rock.pos.x - station.pos.x;
    const dz = rock.pos.z - station.pos.z;
    const distance = Math.hypot(dx, dz) || 1;
    const outwardSpeed = (rock.vel.x * dx + rock.vel.z * dz) / distance;
    if (!(outwardSpeed >= FALLING_ROCK_CLEAR_SPEED)) return;
    if (live.data.chargeHits >= 2) {
      finish(d, live, state, 'stacked_impulse_charges', 'FALLING ROCK TURNED: stacked charges kicked the mass clear');
    } else if (live.data.railHits >= 3) {
      finish(d, live, state, 'mass_driver_barrage', 'FALLING ROCK TURNED: repeated mass-driver hits changed the course');
    } else if (live.data.tethered && live.data.towBurnStages >= 2) {
      finish(d, live, state, 'multi_burn_tow', 'FALLING ROCK TURNED: the Massline tow held through repeated burns');
    }
  },
  event(d, live, state, name, payload = {}) {
    if (name !== 'tetherAttached' || payload.actorId !== state.playerId) return;
    if (payload.targetId === live.data.rockId) live.data.tethered = true;
  },
});

function stationTurretSpec(pos, rot) {
  const spec = makeShipEntitySpec('ship_hornet', {
    team: 0,
    factionId: 'faction_scn',
    pos,
    rot,
    fittings: fittingsFromDefaultModules('ship_hornet', ['wpn_flak_turret_s']),
  });
  spec.hull = 40;
  spec.hullMax = 40;
  spec.armorHp = 0;
  spec.armorMax = 0;
  spec.armorFlat = 0;
  spec.shield = 0;
  spec.shieldMax = 0;
  spec.shieldRegenRate = 0;
  spec.mass = 280;
  spec.physicsBody = {
    dynamic: false,
    radius: spec.radius,
    mass: 280,
    inertiaY: 280 * spec.radius * spec.radius,
    material: 'station',
    shape: 'ball',
  };
  spec.data.setpieceRole = 'station_turret';
  spec.data.scanLabel = 'Station defense turret';
  spec.data.ai = {
    approachTelegraph: 'station_target_lock',
    noFireResponseWindowS: 1,
    lawful: false,
  };
  return spec;
}

function revealStationSiege(d, live) {
  const station = stationaryStructure(d, live, {
    role: 'station',
    pos: { x: live.anchor.x, z: live.anchor.z },
    radius: 64,
    label: 'Besieged station',
    stationId: `siege-station:${live.id}`,
    // An Archive outpost is not a lawful safe-zone bubble. The rare authored siege remains live
    // combat instead of borrowing Concord jurisdiction that would correctly suppress all fire.
    factionId: 'faction_archive',
  });
  const turretPlans = [-1, 1].map((side) => ({
    entitySpec: stationTurretSpec({ x: live.anchor.x, z: live.anchor.z + side * 92 }, side > 0 ? -Math.PI / 2 : Math.PI / 2),
    role: 'station_turret',
    squadId: `station-turrets:${live.id}`,
    // The static Rapier body owns the emplacement geometry; interceptor_flyby supplies the
    // ordinary telegraph/strike fire window without pretending this fixed module can maneuver.
    combatDoctrineId: 'interceptor_flyby',
    team: 0,
    factionId: 'faction_scn',
    passive: false,
    pos: { x: live.anchor.x, z: live.anchor.z + side * 92 },
    context: 'station_defense',
  }));
  const turretIds = d.spawnShips(live, turretPlans);
  const raiderPlans = [0, 1, 2].map((index) => ({
    archetype: index === 0 ? 'medium_interceptor' : 'reaver_pirate',
    level: 6,
    role: 'raider',
    squadId: `station-siege-raiders:${live.id}`,
    team: 1,
    factionId: 'faction_reach',
    passive: false,
    targetId: turretIds[index % Math.max(1, turretIds.length)],
    pos: {
      x: live.anchor.x + 80 + index * 20,
      z: live.anchor.z + (index - 1) * 72,
    },
    context: 'station_siege',
    doctrine: 'balanced',
  }));
  const raiderIds = d.spawnShips(live, raiderPlans);
  if (!station || turretIds.length !== 2 || raiderIds.length !== 3) return false;
  live.data.stationId = station.id;
  live.data.turretIds = turretIds.slice();
  live.data.raiderIds = raiderIds.slice();
  live.data.moduleWreckIds = [];
  live.phase = 'physical';
  d.emit('setpiece:revealed', { encounterId: live.id, kind: live.shapeId, ids: [...turretIds, ...raiderIds] });
  return true;
}

const stationSiege = Object.freeze({
  fire(d, live) {
    beginWarning(d, live, 'LOCAL NEWS: station defense grid reports a rare siege formation inbound');
  },
  tick(d, live, state, now) {
    if (live.phase === 'warning' && now >= live.data.revealAt) {
      if (!revealStationSiege(d, live)) d.abort(live, 'spawn_failed');
      return;
    }
    if (live.phase !== 'physical') return;
    const turrets = (live.data.turretIds || []).filter((id) => isLiveEncounterActor(live, state, id));
    const raiders = (live.data.raiderIds || []).filter((id) => isLiveEncounterActor(live, state, id));
    if (raiders.length === 0 && turrets.length > 0) {
      finish(d, live, state, 'station_held', 'SIEGE BROKEN: surviving station guns reopen the lane', {
        rep: { factionId: 'faction_scn', delta: 8, reason: 'station_siege_defended' },
      });
    } else if (turrets.length === 0) {
      finish(d, live, state, 'station_overrun', 'STATION OVERRUN: wrecked defense modules now choke the approach', {
        danger: { kind: 'station_siege_loss', delta: 0.035 },
      });
    }
  },
  event(d, live, state, name, payload = {}) {
    if (name !== 'squadKill' || payload.role !== 'station_turret') return;
    const turret = state.entities.get(payload.id);
    if (!turret || turret.data?.setpieceModuleWrecked) return;
    turret.data = turret.data || {};
    turret.data.setpieceModuleWrecked = true;
    live.data.moduleWreckIds.push(...spawnDebris(d, live, turret.pos, turret.vel, 'station_siege_module', 1, true));
  },
});

function convoyFreighterSpec(pos) {
  const spec = makeShipEntitySpec('ship_mule', {
    team: 0,
    factionId: 'faction_mts',
    pos,
    fittings: fittingsFromDefaultModules('ship_mule', ['wpn_flak_turret_s']),
  });
  spec.data.setpieceRole = 'freighter';
  spec.data.scanLabel = 'Drive-disabled convoy freighter';
  spec.data.driveDisabled = true;
  spec.hull = Math.min(120, spec.hullMax);
  spec.armorHp = 0;
  spec.armorMax = 0;
  spec.armorFlat = 0;
  spec.shield = 0;
  spec.shieldMax = 0;
  spec.shieldRegenRate = 0;
  spec.physicsBody = {
    dynamic: false,
    radius: spec.radius,
    mass: spec.mass,
    inertiaY: spec.mass * spec.radius * spec.radius,
    material: 'ship',
    shape: 'ball',
  };
  spec.data.ai = {
    approachTelegraph: 'convoy_defense_call',
    noFireResponseWindowS: 1,
    lawful: false,
  };
  return spec;
}

function revealConvoyLastStand(d, live) {
  const freighterPlans = [0, 1, 2].map((index) => ({
    entitySpec: convoyFreighterSpec({
      x: live.anchor.x - 70 + index * 70,
      z: live.anchor.z + (index - 1) * 58,
    }),
    role: 'freighter',
    squadId: `convoy-freighters:${live.id}`,
    combatDoctrineId: 'ranged_disengager',
    team: 0,
    factionId: 'faction_mts',
    passive: false,
    pos: { x: live.anchor.x - 70 + index * 70, z: live.anchor.z + (index - 1) * 58 },
    context: 'convoy_last_stand',
    doctrine: 'civilian',
  }));
  const freighterIds = d.spawnShips(live, freighterPlans);
  const raiderPlans = [0, 1, 2, 3].map((index) => ({
    archetype: index === 0 ? 'medium_marauder' : 'reaver_pirate',
    level: 6,
    role: 'raider',
    squadId: `convoy-raiders:${live.id}`,
    team: 1,
    factionId: 'faction_reach',
    passive: false,
    targetId: freighterIds[index % Math.max(1, freighterIds.length)],
    pos: { x: live.anchor.x + 230 + index * 22, z: live.anchor.z + (index - 1.5) * 66 },
    context: 'convoy_last_stand',
    doctrine: 'scavenger',
  }));
  const raiderIds = d.spawnShips(live, raiderPlans);
  if (freighterIds.length !== 3 || raiderIds.length !== 4) return false;
  live.data.freighterIds = freighterIds.slice();
  live.data.raiderIds = raiderIds.slice();
  live.data.freighterWreckIds = [];
  live.phase = 'physical';
  d.emit('setpiece:revealed', { encounterId: live.id, kind: live.shapeId, ids: [...freighterIds, ...raiderIds] });
  return true;
}

const convoyLastStand = Object.freeze({
  fire(d, live) {
    beginWarning(d, live, 'TRAFFIC RUMOR CONFIRMED: trapped freighters are forming a last stand');
  },
  tick(d, live, state, now) {
    if (live.phase === 'warning' && now >= live.data.revealAt) {
      if (!revealConvoyLastStand(d, live)) d.abort(live, 'spawn_failed');
      return;
    }
    if (live.phase !== 'physical') return;
    const freighters = (live.data.freighterIds || []).filter((id) => isLiveEncounterActor(live, state, id));
    const raiders = (live.data.raiderIds || []).filter((id) => isLiveEncounterActor(live, state, id));
    if (raiders.length === 0 && freighters.length > 0) {
      finish(d, live, state, 'convoy_survived', 'CONVOY SURVIVES: remaining freighters hold for recovery tugs', {
        rep: { factionId: 'faction_mts', delta: 10, reason: 'convoy_last_stand_defended' },
      });
    } else if (freighters.length === 0) {
      finish(d, live, state, 'convoy_destroyed', 'CONVOY LOST: a physical debris field marks the failed last stand', {
        danger: { kind: 'convoy_last_stand_loss', delta: 0.04 },
      });
    }
  },
  event(d, live, state, name, payload = {}) {
    if (name !== 'squadKill' || payload.role !== 'freighter') return;
    const freighter = state.entities.get(payload.id);
    if (!freighter || freighter.data?.setpieceWrecked) return;
    freighter.data = freighter.data || {};
    freighter.data.setpieceWrecked = true;
    live.data.freighterWreckIds.push(...spawnDebris(d, live, freighter.pos, freighter.vel, 'convoy_last_stand', 2, false));
  },
});

function revealRunawayReactor(d, live) {
  const lane = stationaryStructure(d, live, {
    role: 'populated_lane',
    pos: { x: live.anchor.x, z: live.anchor.z },
    radius: 70,
    label: 'Populated traffic lane',
    stationId: `reactor-lane:${live.id}`,
  });
  const reactorSpec = makeShipEntitySpec('ship_mule', {
    team: 2,
    factionId: 'faction_free',
    pos: { x: live.anchor.x - 420, z: live.anchor.z },
    rot: 0,
    fittings: fittingsFromDefaultModules('ship_mule', []),
    ai: null,
  });
  reactorSpec.vel = { x: 18, z: 0 };
  reactorSpec.shield = 0;
  reactorSpec.shieldMax = 0;
  reactorSpec.armorHp = 0;
  reactorSpec.armorMax = 0;
  reactorSpec.hull = Math.min(140, reactorSpec.hullMax);
  reactorSpec.physicsBody = {
    dynamic: true,
    ccd: true,
    radius: reactorSpec.radius,
    mass: reactorSpec.mass,
    inertiaY: Math.max(1, reactorSpec.mass * reactorSpec.radius * reactorSpec.radius),
    material: 'ship',
    shape: 'capsule',
  };
  reactorSpec.data.setpieceRole = 'runaway_reactor';
  reactorSpec.data.scanLabel = 'Runaway reactor — venting';
  reactorSpec.data.reactorVenting = true;
  reactorSpec.data.tetherable = true;
  reactorSpec.data.encounterId = live.id;
  // Flight V3 owns every ship body's control frame. An explicit Newtonian neutral intent keeps
  // this damaged, uncrewed hull on its authored inertial course without a hidden controller
  // braking it; any later change still comes from weapons, Massline, or Rapier contact.
  reactorSpec.data.intent = {
    assistMode: 'newtonian',
    moveZ: 0,
    moveX: 0,
    turnIntent: 0,
    boost: false,
    brake: false,
  };
  const reactor = bindPhysical(d, live, reactorSpec, 'runaway_reactor');
  if (!lane || !reactor) return false;
  Object.assign(live.data, {
    laneId: lane.id,
    reactorId: reactor.id,
    tethered: false,
    impact: null,
    kill: null,
    startDistance: Math.hypot(reactor.pos.x - lane.pos.x, reactor.pos.z - lane.pos.z),
  });
  listen(d, live, 'physics:impact', (payload = {}) => {
    if (pair(payload, reactor.id, lane.id)) live.data.impact = { ...payload };
  });
  live.phase = 'physical';
  d.emit('setpiece:revealed', { encounterId: live.id, kind: live.shapeId, ids: [lane.id, reactor.id] });
  return true;
}

function reactorDebris(d, live, reactor, kind, count) {
  const at = reactor && reactor.pos || live.anchor;
  return spawnDebris(d, live, at, reactor && reactor.vel, kind, count, false);
}

const runawayReactor = Object.freeze({
  fire(d, live) {
    beginWarning(d, live, 'OPEN-BAND MAYDAY: a venting reactor ship is drifting into the populated lane');
  },
  tick(d, live, state, now) {
    if (live.phase === 'warning' && now >= live.data.revealAt) {
      if (!revealRunawayReactor(d, live)) d.abort(live, 'spawn_failed');
      return;
    }
    if (live.phase !== 'physical') return;
    const reactor = state.entities.get(live.data.reactorId);
    const lane = state.entities.get(live.data.laneId);
    if (!lane) return;
    if (live.data.impact) {
      live.data.debrisIds = reactorDebris(d, live, reactor, 'reactor_lane_breach', 6);
      finish(d, live, state, 'reactor_lane_breach', 'REACTOR BREACH: the populated lane is closed around a burning debris field', {
        danger: { kind: 'reactor_lane_breach', delta: 0.05 },
      });
      return;
    }
    if (live.data.kill) {
      const body = reactor || live.data.kill.body;
      const distance = Math.hypot(body.pos.x - lane.pos.x, body.pos.z - lane.pos.z);
      live.data.debrisIds = reactorDebris(d, live, body,
        distance >= REACTOR_SAFE_DISTANCE ? 'reactor_safe_detonation' : 'reactor_close_detonation', 4);
      if (distance >= REACTOR_SAFE_DISTANCE) {
        finish(d, live, state, 'reactor_destroyed_safe', 'REACTOR DESTROYED CLEAR: fragments miss the populated lane');
      } else {
        finish(d, live, state, 'reactor_detonated_close', 'REACTOR DETONATED CLOSE: debris tears through the populated lane', {
          danger: { kind: 'reactor_close_detonation', delta: 0.04 },
        });
      }
      return;
    }
    if (!reactor) return;
    const dx = reactor.pos.x - lane.pos.x;
    const dz = reactor.pos.z - lane.pos.z;
    const distance = Math.hypot(dx, dz) || 1;
    const outwardSpeed = (reactor.vel.x * dx + reactor.vel.z * dz) / distance;
    if (distance >= REACTOR_CLEAR_DISTANCE && outwardSpeed > 2) {
      finish(d, live, state,
        live.data.tethered ? 'reactor_towed_clear' : 'reactor_shoved_sunward',
        live.data.tethered
          ? 'REACTOR TOWED CLEAR: the damaged ship is moving away from the lane'
          : 'REACTOR DIVERTED: the venting hull is falling sunward of traffic');
    }
  },
  event(d, live, state, name, payload = {}) {
    if (name === 'tetherAttached' && payload.actorId === state.playerId
      && payload.targetId === live.data.reactorId) {
      live.data.tethered = true;
    } else if (name === 'squadKill' && payload.role === 'runaway_reactor') {
      const reactor = state.entities.get(payload.id);
      live.data.kill = {
        killerId: payload.killerId,
        byPlayer: payload.byPlayer === true,
        body: {
          pos: { x: Number(reactor && reactor.pos.x) || Number(payload.pos && payload.pos.x) || 0,
            z: Number(reactor && reactor.pos.z) || Number(payload.pos && payload.pos.z) || 0 },
          vel: { x: Number(reactor && reactor.vel.x) || 0, z: Number(reactor && reactor.vel.z) || 0 },
        },
      };
    }
  },
});

function isLiveEncounterActor(live, state, id) {
  // Entity ids can be recycled by projectiles after encounter actors are swept. Director removal
  // from live.ids is therefore the stable identity receipt; the entity table alone is insufficient.
  if (!live || !Array.isArray(live.ids) || !live.ids.includes(id)) return false;
  const entity = state && state.entities && state.entities.get(id);
  return !!entity && entity.alive !== false;
}

export const SETPIECE_EVENT_RUNTIMES = Object.freeze({
  fallingRock,
  stationSiege,
  convoyLastStand,
  runawayReactor,
});
