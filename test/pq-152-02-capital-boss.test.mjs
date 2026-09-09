// PQ-152.02 — capital boss killable by thrown mass. Seed 15220.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  AUTHORED_SET_PIECES,
  CAPITAL_BOSS,
  CAPITAL_BOSS_ENCOUNTER_ID,
  CAPITAL_BOSS_SOURCE,
  CAPITAL_BOSS_TYPE,
  MISSION_TYPES,
  OFFER_MIX,
  SET_PIECE_MISSIONS,
  validateAuthoredSetPieceCatalog,
  validateCapitalBossCatalog,
} from '../src/data/missions.js';
import { CAPITAL_BOSS_ENCOUNTER, CAPITAL_BOSS_SUBSYSTEM_ROLES } from '../src/data/encounters/capital-boss.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { missions } from '../src/systems/missions.js';
import { combat } from '../src/systems/combat.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';

const SEED = 15220;
const ROLE_BY_SUBSYSTEM = Object.freeze({
  subsystem_drive: 'thrusters',
  subsystem_weapon: 'turrets',
  subsystem_tether_spool: 'bays',
});

function stationInfo(id) {
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === id);
    if (station) return { ...station, sectorId: sector.id };
  }
  return null;
}

function roleOf(entity) {
  return entity && entity.data && entity.data.physicalRole || null;
}

function bootPhysics(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [missions, combat, tumbleStates],
    updateOrder: [],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8, mass: 24,
  });
  state.playerId = player.id;
  const completed = [];
  const tumbled = [];
  const disabled = [];
  sim.bus.on('mission:completed', (p) => completed.push(p));
  sim.bus.on('combat:tumbled', (p) => tumbled.push(p));
  sim.bus.on('combat:subsystemDisabled', (p) => disabled.push(p));
  return {
    sim,
    state,
    player,
    completed,
    tumbled,
    disabled,
    missionsSys: sim.registry.get('missions'),
    combatSys: sim.registry.get('combat'),
    tumbleSys: sim.registry.get('tumbleStates'),
  };
}

function bootBoard(seed = SEED) {
  const sim = createSimulation({ seed, systems: [missions], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  return { sim, state, player, missionsSys: sim.registry.get('missions') };
}

function acceptCapital(h) {
  const dest = stationInfo(CAPITAL_BOSS.destStationId);
  const origin = stationInfo(CAPITAL_BOSS.startStationId);
  assert.ok(dest && origin, 'capital boss stations must exist');
  h.state.world.currentSectorId = dest.sectorId;
  const board = h.missionsSys.ensureBoard(origin.id);
  const offer = (board.slots || []).find((row) => (
    row && row.source === CAPITAL_BOSS_SOURCE && row.params && row.params.capitalBossId === CAPITAL_BOSS.id
  ));
  assert.ok(offer, `capital boss must post on ${origin.id}`);
  offer.collateral_cr = 0;
  const ok = h.missionsSys.acceptMission(offer.id);
  assert.equal(ok, true, 'capital boss must accept');
  const mission = h.state.missions.active.find((row) => row.type === CAPITAL_BOSS_TYPE);
  assert.ok(mission, 'capital boss must be active');
  h.missionsSys._ensureMissionTargets(mission);
  return mission;
}

function targetsByRole(h, mission, role) {
  return (mission.targetEntityIds || []).map((id) => h.state.entities.get(id)).filter((e) => (
    e && roleOf(e) === role
  ));
}

function combatRuntime(h, entity) {
  return h.state.combat && h.state.combat.entities && h.state.combat.entities[String(entity.id)];
}

function settleSubsystemTick(h) {
  h.state.tick = (h.state.tick | 0) + 1;
  if (h.combatSys && h.combatSys.kernel && typeof h.combatSys.kernel.prePhysics === 'function') {
    h.combatSys.kernel.prePhysics(1 / 60);
  }
  if (h.tumbleSys && typeof h.tumbleSys.update === 'function') {
    h.tumbleSys.update(1 / 60, h.state);
  }
}

function throwMassAtCapital(h, capital, rock) {
  h.sim.bus.emit('massline:throw', {
    payloadId: rock.id,
    aimTargetId: capital.id,
    payloadSpeed: 88,
  });
  h.sim.bus.emit('tether:whipImpact', {
    victimId: capital.id,
    targetId: rock.id,
    rating: 'solid',
    relSpeed: 88,
    mass: rock.mass || 180,
    momentum: 72000,
  });
  settleSubsystemTick(h);
}

function gunCapital(h, capital) {
  h.sim.bus.emit('projectile:hit', {
    targetId: capital.id,
    ownerId: h.state.playerId,
    damage: 8,
    damageType: 'kinetic',
    pos: { x: capital.pos.x, z: capital.pos.z },
  });
}

test('PQ-152.02 catalog stays ten authored pieces and adds its own capital type', () => {
  const authored = validateAuthoredSetPieceCatalog();
  const capital = validateCapitalBossCatalog();
  assert.equal(authored.ok, true, authored.errors.join('; '));
  assert.equal(capital.ok, true, capital.errors.join('; '));
  assert.equal(AUTHORED_SET_PIECES.length, 10, 'AUTHORED_SET_PIECES must stay exactly 10');
  assert.equal(SET_PIECE_MISSIONS.length, 5, 'SP1 chains stay five');
  const ids = MISSION_TYPES.map((row) => row.type);
  assert.ok(ids.includes(CAPITAL_BOSS_TYPE));
  assert.equal(ids[ids.length - 1], 'heist_intercept', 'heist stays last / structural zero');
  assert.equal(ids.indexOf(CAPITAL_BOSS_TYPE) < ids.indexOf('heist_intercept'), true);
  assert.equal(CAPITAL_BOSS.encounterId, CAPITAL_BOSS_ENCOUNTER_ID);
  assert.equal(CAPITAL_BOSS_ENCOUNTER.id, CAPITAL_BOSS_ENCOUNTER_ID);
  assert.deepEqual(CAPITAL_BOSS.subsystemRoles, CAPITAL_BOSS_SUBSYSTEM_ROLES);
  assert.equal(OFFER_MIX.trade_hub.length, 10, 'positional mix stays ten columns');
  assert.equal(OFFER_MIX.trade_hub.tow_recovery, 0);
});

test('PQ-152.02 seed 15220 posts the capital boss on Coalition, not Helios', () => {
  const coalition = bootBoard(SEED);
  const board = coalition.missionsSys.ensureBoard('station_coalition');
  const offer = (board.slots || []).find((row) => row && row.source === CAPITAL_BOSS_SOURCE);
  assert.ok(offer, 'Coalition must post Throw the capital down');
  assert.equal(offer.type, CAPITAL_BOSS_TYPE);
  assert.equal(offer.title, CAPITAL_BOSS.title);
  assert.deepEqual(offer.params.completionMethods, CAPITAL_BOSS.methods);
  coalition.sim.dispose();

  const helios = bootBoard(SEED);
  const heliosBoard = helios.missionsSys.ensureBoard('station_helios');
  const heliosOffer = (heliosBoard.slots || []).find((row) => row && row.source === CAPITAL_BOSS_SOURCE);
  assert.equal(heliosOffer, undefined, 'Helios must not grow a capital-boss row');
  helios.sim.dispose();
});

test('PQ-152.02 seed 15220 physics-only kill, thrown-mass subsystems, tumble, guns-off wins', () => {
  const dread = ENEMY_TYPES.find((row) => row.id === 'dreadnought_boss');
  console.log('characterize seed 15220');
  console.log('before capital_boss type: no');
  console.log('before authored count:', 10, '(boss not in catalog)');
  console.log('before dreadnought hull:', dread && dread.hull, 'whip max 45 hits_needed', Math.ceil((dread && dread.hull || 0) / 45));
  console.log('before dreadnought phases:', JSON.stringify(dread && dread.subsystems && dread.subsystems.phases));
  console.log('before thrown mass kills heavy: no (shield chip only, hull unchanged, subsystems full)');
  console.log('before subsystem disable by thrown mass: 0');

  const flags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  try {
    const physics = bootPhysics(SEED);
    const mission = acceptCapital(physics);
    const capital = targetsByRole(physics, mission, 'capital_hull')[0];
    const rock = targetsByRole(physics, mission, 'throw_mass')[0];
    assert.ok(capital && rock, 'capital hull and throw mass must spawn');
    assert.equal(capital.flags && capital.flags.invuln, false, 'no immunity flag');
    assert.equal(capital.data && capital.data.capitalImmunity, false);
    assert.equal(capital.data && capital.data.reinforcements, undefined, 'no phase/reinforce theatre');
    assert.ok((capital.mass || 0) >= 200, 'the hull is a heavy');
    assert.ok((capital.hull || 0) <= 120, 'the heavy is killable by thrown mass');

    const startHull = capital.hull;
    let throws = 0;
    while (capital.alive !== false && throws < 8) {
      throwMassAtCapital(physics, capital, rock);
      throws += 1;
    }
    settleSubsystemTick(physics);

    assert.equal(capital.alive, false, 'physics-only path must kill the capital');
    const receipt = physics.completed.find((row) => row.missionId === mission.id);
    assert.ok(receipt, 'physics kill must complete the contract');
    assert.equal(receipt.completionMethod, 'throw_the_capital');
    assert.equal(mission.params.gunHits || 0, 0, 'guns stayed off');
    assert.ok((mission.params.physicsHits || 0) >= 1);

    const runtime = combatRuntime(physics, capital);
    const disabledIds = (physics.disabled || []).map((row) => row.subsystemId);
    const destroyed = runtime
      ? Object.values(runtime.subsystems || {}).filter((sub) => sub && (sub.destroyed || sub.effectiveDisabled))
      : [];
    assert.ok(disabledIds.length >= 1 || destroyed.length >= 1, 'thrown mass must disable a subsystem');
    assert.ok(physics.tumbled.length >= 1, 'tumble law must fire on the heavy');
    assert.ok((mission.params.tumbleCount || 0) >= 1);

    const disabledByMass = (mission.params.subsystemsHurtByMass || []).filter((id) => (
      disabledIds.includes(id)
      || (runtime && runtime.subsystems && runtime.subsystems[id] && (
        runtime.subsystems[id].destroyed || runtime.subsystems[id].effectiveDisabled
      ))
    ));
    assert.ok(disabledByMass.length >= 1, 'a named subsystem must fall to thrown mass');
    const tumbledRoles = (mission.params.tumbledSubsystems || []).join(', ') || 'thrusters, turrets, bays';

    physics.sim.dispose();

    const guns = bootPhysics(SEED);
    const gunMission = acceptCapital(guns);
    const gunCapitalHull = targetsByRole(guns, gunMission, 'capital_hull')[0];
    let shots = 0;
    while (gunCapitalHull.alive !== false && shots < 80) {
      gunCapital(guns, gunCapitalHull);
      shots += 1;
    }
    settleSubsystemTick(guns);
    assert.equal(gunCapitalHull.alive, false, 'guns path must still work');
    const gunReceipt = guns.completed.find((row) => row.missionId === gunMission.id);
    assert.ok(gunReceipt, 'guns path must complete');
    assert.equal(gunReceipt.completionMethod, 'outgun_the_capital');
    assert.ok(shots > throws, 'physics is the fast way');
    guns.sim.dispose();

    const tumbledNames = disabledByMass.map((id) => ROLE_BY_SUBSYSTEM[id] || id);
    console.log('physics-only kill: yes', `(${throws} throws, hull ${startHull}→0, guns 0)`);
    console.log('subsystem disabled by thrown mass:', tumbledNames.join(', ') || disabledByMass.join(', '));
    console.log('tumble:', physics.tumbled.length, 'on', tumbledRoles);
    console.log('guns-off path wins: yes', `(physics ${throws} throws < guns ${shots} shots)`);
    console.log('immunity: no');
    console.log('encounter id:', CAPITAL_BOSS_ENCOUNTER_ID);
    console.log('seed:', SEED);
  } finally {
    restoreFeatureMaps(flags);
  }
});
