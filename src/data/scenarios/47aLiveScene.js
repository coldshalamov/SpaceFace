import { fittingsFromDefaultModules, makeShipEntitySpec } from '../../systems/ships.js';
import { CombatDoctrineId } from '../../ai/combatDoctrine.js';

export const SCENARIO_47A_ID = 'scenario.47a.mass-discrepancy';
export const SCENARIO_47A_CONTRACT_PATH = 'src/data/scenarios/47a.scenario.json';

export function mark47aPlayerActor(player) {
  if (!player) return null;
  player.data = Object.assign({}, player.data, {
    scenarioActorId: 'player_kestrel',
    scenarioRole: 'player_ship',
  });
  return player;
}

export function makeEvidenceSpindleSpec({ pos, rot = 0 } = {}) {
  return {
    type: 'payload',
    alive: true,
    collides: false,
    radius: 10,
    mass: 960,
    flightModel: { inertia: 1200 },
    pos: pos || { x: 92, z: 0 },
    vel: { x: 0, z: 0 },
    rot,
    angVel: 0,
    team: 0,
    factionId: 'faction_free',
    hull: 180,
    hullMax: 180,
    armorHp: 120,
    armorMax: 120,
    armorFlat: 6,
    shield: 0,
    shieldMax: 0,
    cap: 0,
    capMax: 0,
    capRegen: 0,
    flags: { persistent: true },
    data: {
      scenarioActorId: 'evidence_spindle_47a',
      scenarioRole: 'tether_payload',
      assetRef: 'asset.slice.47a_spindle',
      tetherPayload: true,
      objectiveValue: 1,
      falseMassKg: 960,
      manifestMassKg: 480,
      // The evidence spindle is the isolated exception: its authored false-mass anomaly preserves
      // 47-A's overload telemetry without making ordinary action_attach targets breakable.
      masslineBreakPolicy: 'extreme_overload',
      derived: { damageReductionMult: 1 },
      combatProfileId: 'combat_profile_tether_payload',
    },
    physicsBody: {
      schemaVersion: 1,
      radius: 10,
      mass: 960,
      inertiaY: 1200,
      dynamic: true,
      ccd: true,
      material: 'sensor',
      attachmentPoints: { massline: { x: 0, y: 0, z: 0 } },
      revision: 0,
    },
  };
}

export function spawn47aOpeningScene({ state, helpers, spawn = null, includeTargetDummy = false, liveColdStartSafe = false } = {}) {
  const spawnEntity = spawn || (helpers && helpers.spawnEntity);
  if (typeof spawnEntity !== 'function') {
    throw new Error('47-A opening scene requires a spawnEntity helper');
  }
  const spawned = {};
  spawned.spindle = spawnEntity(makeEvidenceSpindleSpec({ pos: { x: 92, z: 0 }, rot: 0 }));
  if (includeTargetDummy) {
    spawned.targetDummy = spawnEntity(makeShipEntitySpec('ship_wasp', {
      team: 1,
      factionId: 'faction_reavers',
      pos: { x: 620, z: -18 },
      rot: Math.PI,
      ai: { role: 'target_dummy' },
    }));
    spawned.targetDummy.radius = Math.max(spawned.targetDummy.radius || 0, 44);
    spawned.targetDummy.flags = Object.assign({}, spawned.targetDummy.flags, { persistent: true });
  }
  Object.assign(spawned, spawn47aScenarioCast({ state, spawn: spawnEntity, liveColdStartSafe }));
  return spawned;
}

export function spawn47aScenarioCast(simOrOptions) {
  const state = simOrOptions && simOrOptions.state;
  const spawnEntity = resolveSpawnEntity(simOrOptions);
  const liveColdStartSafe = !!(simOrOptions && simOrOptions.liveColdStartSafe);
  if (typeof spawnEntity !== 'function') {
    throw new Error('47-A scenario cast requires a spawn function');
  }
  const result = {};

  const carrier = spawnEntity(makePassiveScenarioSpec({
    type: 'wreck',
    actorId: 'carrier_wreck_bourse',
    role: 'arena_landmark',
    assetRef: 'asset.slice.bourse_carrier_wreck',
    pos: { x: 340, z: 220 },
    rot: -0.22,
    radius: 92,
    mass: 9000,
    hull: 2200,
    data: {
      majorDebris: true,
      cameraAnchor: true,
      hazardState: 'stable',
    },
  }));
  carrier.flags = Object.assign({}, carrier.flags, { persistent: true });
  result.carrier = carrier;

  const interceptor = spawnEntity(makeShipEntitySpec('ship_wasp', {
    team: 1,
    factionId: 'faction_reavers',
    fittings: fittingsFromDefaultModules('ship_wasp', ['wpn_pulse_laser_s']),
    // Keep the deterministic harness interceptor clear of the harasser-to-player firing lane.
    // The public live route replaces this with the authored cold-start holding position below.
    pos: { x: 560, z: 260 },
    rot: Math.PI,
    ai: { role: '47a_interceptor', dormantUntilBeat: 'scavenger_arrival' },
  }));
  markScenarioActor(interceptor, {
    actorId: 'scavenger_interceptor',
    role: 'enemy_light_intercept',
    assetRef: 'enemy_reaver_interceptor',
    extraData: { tacticRole: 'interceptor_flyby' },
  });
  configure47aTacticalAI(interceptor, {
    squadId: '47a_scavenger_wing',
    doctrine: 'scavenger',
    preferredRole: 'interceptor',
    capabilities: ['drive', 'sensor', 'weapon', 'ranged', 'screen', 'counter_tether_overload'],
    combatDoctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
  });
  if (state && state.playerId && !liveColdStartSafe) {
    interceptor.data.combat = Object.assign({}, interceptor.data.combat, { targetId: state.playerId });
  }
  if (liveColdStartSafe) markLiveColdStartDormant(interceptor, {
    activationBeat: 'scavenger_arrival',
    holdingPos: { x: 1760, z: 260 },
  });
  result.interceptor = interceptor;

  const harasser = spawnEntity(makeShipEntitySpec('ship_wasp', {
    team: 1,
    factionId: 'faction_reavers',
    fittings: fittingsFromDefaultModules('ship_wasp', ['wpn_pulse_laser_s']),
    // The deterministic harness keeps this angle clear of its large target dummy so proof shots
    // exercise real hostile damage instead of being swallowed as rejected friendly fire.
    pos: { x: 650, z: 300 },
    rot: Math.PI,
    ai: { role: '47a_harasser', dormantUntilBeat: 'scavenger_arrival' },
  }));
  markScenarioActor(harasser, {
    actorId: 'scavenger_harasser',
    role: 'enemy_light_harass',
    assetRef: 'enemy_reaver_skirmisher',
    extraData: { tacticRole: 'standoff_focus' },
  });
  configure47aTacticalAI(harasser, {
    squadId: '47a_scavenger_wing',
    doctrine: 'scavenger',
    preferredRole: 'support',
    capabilities: ['drive', 'sensor', 'weapon', 'ranged', 'screen', 'counter_tether_cut'],
  });
  if (state && state.playerId && !liveColdStartSafe) {
    harasser.data.combat = Object.assign({}, harasser.data.combat, { targetId: state.playerId });
  }
  if (liveColdStartSafe) markLiveColdStartDormant(harasser, { activationBeat: 'scavenger_arrival', holdingPos: { x: 1900, z: 760 } });
  result.harasser = harasser;

  const thief = spawnEntity(makeShipEntitySpec('ship_mule', {
    team: 1,
    factionId: 'faction_reavers',
    fittings: fittingsFromDefaultModules('ship_mule', ['wpn_pulse_laser_s']),
    pos: { x: 780, z: -145 },
    rot: Math.PI,
    ai: { role: '47a_thief', dormantUntilBeat: 'scavenger_arrival' },
  }));
  markScenarioActor(thief, {
    actorId: 'scavenger_thief',
    role: 'enemy_light_steal',
    assetRef: 'enemy_reaver_tug',
    extraData: { tacticRole: 'screen_tug_steal' },
  });
  configure47aTacticalAI(thief, {
    squadId: '47a_scavenger_wing',
    doctrine: 'scavenger',
    preferredRole: 'tug',
    capabilities: ['drive', 'sensor', 'weapon', 'tether', 'tug', 'steal', 'screen', 'counter_tether_overload'],
  });
  if (liveColdStartSafe) markLiveColdStartDormant(thief, { activationBeat: 'scavenger_arrival', holdingPos: { x: 2040, z: 520 } });
  result.thief = thief;

  const recoveryTug = spawnEntity(makeShipEntitySpec('ship_mule', {
    team: 2,
    factionId: 'faction_scn',
    fittings: fittingsFromDefaultModules('ship_mule', ['wpn_pulse_laser_s']),
    pos: { x: 500, z: -100 },
    rot: -0.35,
    ai: { role: '47a_recovery_tug', dormantUntilBeat: 'recovery_tug' },
  }));
  markScenarioActor(recoveryTug, {
    actorId: 'official_recovery_tug',
    role: 'faction_pressure_tug',
    assetRef: 'asset.slice.meridian_recovery_tug',
    extraData: { tacticRole: 'contain_and_disable' },
  });
  configure47aTacticalAI(recoveryTug, {
    squadId: '47a_recovery_tug',
    doctrine: 'official',
    preferredRole: 'tug',
    capabilities: ['drive', 'sensor', 'weapon', 'tether', 'tug', 'ranged', 'disable', 'counter_tether_cut'],
  });
  if (liveColdStartSafe) markLiveColdStartDormant(recoveryTug, { activationBeat: 'recovery_tug', holdingPos: { x: 2140, z: -640 } });
  result.recoveryTug = recoveryTug;

  result.civilianPod = spawnEntity(makePassiveScenarioSpec({
    type: 'payload',
    actorId: 'civilian_pod',
    role: 'narrative_priority_conflict',
    assetRef: 'asset.slice.civilian_pod',
    pos: { x: -180, z: 160 },
    radius: 8,
    mass: 120,
    hull: 80,
    data: {
      tetherPayload: true,
      distressBeacon: true,
      rescuePriority: true,
    },
  }));

  result.handoffBeacon = spawnEntity(makePassiveScenarioSpec({
    type: 'beacon',
    actorId: 'kessler_handoff_beacon',
    role: 'covert_handoff_zone',
    assetRef: 'asset.slice.kessler_handoff_beacon',
    pos: { x: 282, z: -198 },
    radius: 80,
    mass: 1,
    hull: 1,
    data: {
      handoffZone: true,
      contactActorId: 'contact_kessler',
    },
  }));

  return result;
}

export function configure47aTacticalAI(entity, {
  squadId,
  doctrine,
  preferredRole,
  capabilities,
  combatDoctrineId: authoredCombatDoctrineId = null,
}) {
  const combatDoctrineId = authoredCombatDoctrineId || (preferredRole === 'tug'
    ? CombatDoctrineId.TETHER_CONTROL_RAIDER
    : preferredRole === 'interceptor'
      ? CombatDoctrineId.INTERCEPTOR_FLYBY
      : CombatDoctrineId.RANGED_DISENGAGER);
  entity.data = entity.data || {};
  entity.data.ai = Object.assign({}, entity.data.ai, {
    passive: true,
    squadId,
    doctrine,
    preferredRole,
    capabilities,
    sensorRange: 1800,
    formation: doctrine === 'official' ? 'line' : 'wedge',
    combatDoctrineId,
    motive: preferredRole === 'tug' ? 'recover_evidence_spindle'
      : preferredRole === 'interceptor' ? 'break_claim_screen'
        : 'screen_recovery_claim',
    engagementTrigger: 'scenario_gate_pending',
    zoneId: 'zone_47a_wreck_field',
    approachTelegraph: combatDoctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER ? 'attach_spool' : 'weapon_charge',
    noFireResponseWindowS: 1,
  });
}

function makePassiveScenarioSpec({ type, actorId, role, assetRef, pos, rot = 0, radius, mass, hull, data = {} }) {
  return {
    type,
    alive: true,
    collides: false,
    radius,
    mass,
    pos,
    rot,
    vel: { x: 0, z: 0 },
    angVel: 0,
    team: 0,
    factionId: type === 'wreck' ? null : 'faction_free',
    hull,
    hullMax: hull,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 0,
    capMax: 0,
    capRegen: 0,
    flags: { persistent: true },
    data: Object.assign({
      scenarioActorId: actorId,
      scenarioRole: role,
      assetRef,
    }, data),
  };
}

function markScenarioActor(entity, { actorId, role, assetRef, extraData = {} }) {
  entity.flags = Object.assign({}, entity.flags, { persistent: true });
  entity.data = Object.assign({}, entity.data, extraData, {
    scenarioActorId: actorId,
    scenarioRole: role,
    assetRef,
  });
}

function markLiveColdStartDormant(entity, { activationBeat, holdingPos }) {
  if (!entity) return entity;
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  ai.liveColdStartSafe = true;
  ai.dormantUntilBeat = activationBeat || ai.dormantUntilBeat || null;
  ai.activationTeam = entity.team;
  ai.activationFactionId = entity.factionId || null;
  ai.passive = true;
  data.combat = Object.assign({}, data.combat, { targetId: null, lockTarget: null, lockProgress: 0 });
  data.intent = null;
  entity.team = 0;
  entity.factionId = 'faction_free';
  if (holdingPos && Number.isFinite(holdingPos.x) && Number.isFinite(holdingPos.z)) {
    entity.pos.x = holdingPos.x;
    entity.pos.z = holdingPos.z;
    if (entity.prevPos && typeof entity.prevPos.copy === 'function') {
      entity.prevPos.copy(entity.pos);
    } else if (entity.prevPos) {
      entity.prevPos.x = holdingPos.x;
      entity.prevPos.z = holdingPos.z;
    }
  }
  return entity;
}

function resolveSpawnEntity(source) {
  if (!source) return null;
  if (typeof source.spawn === 'function') return (spec) => source.spawn(spec);
  if (typeof source.spawnEntity === 'function') return (spec) => source.spawnEntity(spec);
  if (source.helpers && typeof source.helpers.spawnEntity === 'function') {
    return (spec) => source.helpers.spawnEntity(spec);
  }
  return null;
}
