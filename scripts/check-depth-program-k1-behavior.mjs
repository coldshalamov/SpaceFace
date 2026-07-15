import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeFactionBehaviorProfile } from '../src/ai/factionBehavior.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = resolve(ROOT, '.devshots', 'depth-program-k1-behavior.json');
const DT = 1 / 60;
const TICKS = 1200;
const POST_DISABLE_TICKS = 120;
const SEED = 0x4b310047;
const CHILD_FLAG = '--capture-one';
const REPORT_PREFIX = 'K1_REPORT:';
const HEADLESS_SKIP = new Set(['render', 'vfx', 'feel', 'audio', 'ui', 'save']);
const SCENARIOS = Object.freeze([
  Object.freeze({ factionId: 'faction_understory', sectorId: 'sector_charon_expanse' }),
  Object.freeze({ factionId: 'faction_fulfillment', sectorId: 'sector_tethys_junction' }),
  Object.freeze({ factionId: 'faction_archive', sectorId: 'sector_pallas_drift' }),
  Object.freeze({ factionId: 'faction_pitborn', sectorId: 'sector_ashfall_reach' }),
  Object.freeze({ factionId: 'faction_verge_layers', sectorId: 'sector_veil_nebula' }),
]);

await main();

async function main() {
  if (process.argv.includes(CHILD_FLAG)) {
    const restoreGlobals = installHeadlessBrowserStubs();
    try {
      const report = await captureAll();
      process.stdout.write(`\n${REPORT_PREFIX}${JSON.stringify(report)}\n`);
    } finally {
      restoreGlobals();
    }
    return;
  }

  const first = captureInChildProcess();
  const replay = captureInChildProcess();
  assert.deepEqual(replay, first, 'live K1 behavior capture must replay exactly from the same seed');
  assertReport(first);
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(first, null, 2)}\n`, 'utf8');
  console.log(`Depth Program K1 live Rapier behavior checks OK (${REPORT_PATH})`);
}

function captureInChildProcess() {
  const stdout = execFileSync(process.execPath, [fileURLToPath(import.meta.url), CHILD_FLAG], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const marker = stdout.lastIndexOf(REPORT_PREFIX);
  assert.notEqual(marker, -1, 'child behavior capture must print its report marker');
  return JSON.parse(stdout.slice(marker + REPORT_PREFIX.length).trim());
}

async function captureAll() {
  const scenarios = [];
  for (const scenario of SCENARIOS) scenarios.push(await captureScenario(scenario));
  const vergeNeutralControl = await captureVergeNeutralControl();
  return {
    schema: 'spaceface.depth-program-k1.behavior.v2',
    seed: SEED,
    ticks: TICKS,
    dt: DT,
    productionPath: {
      registryStep: true,
      aiBackend: 'sg06-tactical',
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
    },
    scenarios,
    vergeNeutralControl,
  };
}

async function captureScenario({ factionId, sectorId }) {
  const harness = await makeHarness(sectorId);
  const { state, bus, helpers, registry, player } = harness;
  const trace = installEventTrace(bus, state);
  try {
    configureScenarioState(state, factionId, sectorId);
    bus.emit('sector:enter', { sectorId });

    const actors = state.entityList
      .filter((entity) => entity && entity.alive !== false && entity.factionId === factionId)
      .sort((a, b) => Number(a.id) - Number(b.id));
    assert(actors.length > 0, `${factionId} must materialize through the live sector-entry seam`);

    const setup = prepareScenarioGeometry({ factionId, state, helpers, registry, player, actors });
    const input = registry.get('input');
    if (setup.provokeTarget) {
      helpers.raycastToPlane = () => point(setup.provokeTarget.pos);
      input._m0 = true;
    }

    state.spatialHash.rebuild(state.entityList);
    const actorIds = new Set(actors.map((actor) => actor.id));
    const profiles = actors.map((actor) => {
      const profile = normalizeFactionBehaviorProfile(actor.data && actor.data.ai
        && actor.data.ai.factionPresenceDoctrine);
      assert(profile, `${factionId} actor must retain its sampled live doctrine on the production entity`);
      return profile;
    });
    const start = new Map(actors.map((actor) => [actor.id, point(actor.pos)]));
    const previous = new Map(actors.map((actor) => [actor.id, point(actor.pos)]));
    const pathDistance = new Map(actors.map((actor) => [actor.id, 0]));
    const observed = {
      decisions: 0,
      maneuverKinds: new Set(),
      objectiveKinds: new Set(),
      formationKinds: new Set(),
      doctrinePhases: new Set(),
      tactics: new Set(),
      preferredRanges: new Set(),
      pursuitCommitments: new Set(),
      targetedIds: new Set(),
      pitbornTargetedConcordIds: new Set(),
    };
    for (const profile of profiles) observed.pursuitCommitments.add(round3(profile.pursuitCommitment));
    const pitbornNeutralAtStart = factionId === 'faction_pitborn'
      ? actors.every((actor) => !isHostileForAI(state, actor, player))
      : null;
    const pitbornHostileToConcordAtStart = factionId === 'faction_pitborn'
      ? setup.concords.every((concord) => actors.some((actor) => isHostileForAI(state, actor, concord)))
      : null;

    let provokedTick = null;
    let promotedAtTick = null;
    let fixtureDisableApplied = false;
    let fixtureDisableTick = null;
    let disabledTick = null;
    const postDisableFireTicks = new Set();
    const postDisableDamagingDecisionTicks = new Set();

    for (let step = 0; step < TICKS; step++) {
      registry.step(DT);
      const tacticalResult = registry.get('tacticalAI').inspect().lastResult;
      if (tacticalResult && tacticalResult.tick === state.tick) {
        observeTacticalResult(tacticalResult, actorIds, setup.concords, observed);
      }

      if (setup.provokeTarget && provokedTick == null) {
        const provocation = trace.rows.find((row) => row.event === 'combat:damage'
          && row.attackerId === player.id && row.targetId === setup.provokeTarget.id && row.applied > 0);
        if (provocation) {
          provokedTick = provocation.tick;
          input._m0 = false;
        }
      }

      if (factionId === 'faction_pitborn' && promotedAtTick == null) {
        const first = setup.concords[0];
        const firstHit = trace.rows.find((row) => row.event === 'projectile:hit'
          && actorIds.has(row.ownerId) && row.targetId === first.id);
        if (firstHit) {
          registry.get('combat').kill(first, actors[0].id, { origin: 'k1_behavior_target_promotion' });
          promotedAtTick = state.tick;
        }
      }

      const relevantFactionHit = trace.rows.find((row) => row.event === 'projectile:hit'
        && actorIds.has(row.ownerId) && row.targetId === setup.disableTarget.id
        && (factionId !== 'faction_pitborn' || promotedAtTick != null));
      let disabledEvent = trace.rows.find((row) => row.event === 'combat:subsystemDisabled'
        && row.targetId === setup.disableTarget.id && row.subsystemId === 'subsystem_drive');
      if (factionId !== 'faction_fulfillment' && !fixtureDisableApplied && !disabledEvent
        && relevantFactionHit && state.tick >= relevantFactionHit.tick + 2) {
        applyDriveDisableFixture(registry, actors[0], setup.disableTarget, factionId);
        fixtureDisableApplied = true;
        fixtureDisableTick = state.tick;
      }
      disabledEvent = trace.rows.find((row) => row.event === 'combat:subsystemDisabled'
        && row.targetId === setup.disableTarget.id && row.subsystemId === 'subsystem_drive');
      if (disabledEvent && disabledTick == null) disabledTick = disabledEvent.tick;

      if (disabledTick != null && state.tick > disabledTick) {
        for (const actor of actors) {
          if (actor.data && actor.data.intent && actor.data.intent.fire) postDisableFireTicks.add(state.tick);
        }
        for (const decision of tacticalResult && tacticalResult.tick === state.tick
          && tacticalResult.decisions || []) {
          if (!actorIds.has(decision.entityId)) continue;
          const doctrine = decision.combatDoctrine;
          if (doctrine && (doctrine.fireWindow || doctrine.allowedActionId)) {
            postDisableDamagingDecisionTicks.add(state.tick);
          }
        }
      }

      for (const actor of actors) {
        const prior = previous.get(actor.id);
        if (!prior || !actor.alive) continue;
        pathDistance.set(actor.id, pathDistance.get(actor.id) + distance(prior, actor.pos));
        previous.set(actor.id, point(actor.pos));
      }

      const requiredPostDisableTicks = factionId === 'faction_fulfillment' ? 30 : POST_DISABLE_TICKS;
      const blackoutSeen = factionId !== 'faction_fulfillment'
        || trace.rows.some((row) => row.event === 'factionPresence:boardingPhase' && row.phase === 'blackout');
      if (disabledTick != null && state.tick - disabledTick >= requiredPostDisableTicks && blackoutSeen
        && (factionId !== 'faction_pitborn' || promotedAtTick != null)) break;
    }
    input._m0 = false;

    const portDiagnostics = registry.get('aiPorts').inspect();
    const physicsDiagnostics = state.physicsRuntime && state.physicsRuntime.diagnostics;
    const actorRows = actors.map((actor, actorIndex) => {
      const telemetry = readPhysicsTelemetry(actor);
      return {
        actorIndex,
        alive: actor.alive !== false,
        displacement: round3(distance(start.get(actor.id), actor.pos)),
        pathDistance: round3(pathDistance.get(actor.id)),
        dynamic: !!telemetry && telemetry.mode === 'rapier-dynamic' && telemetry.dynamic === true,
        finalFireBlockReason: actor.data && actor.data.intent && actor.data.intent.fireBlockReason || null,
        finalCombatTargetId: actor.data && actor.data.combat && actor.data.combat.targetId || null,
        aggressionTrace: actor.data && actor.data.ai && actor.data.ai.lastAggressionTrace || null,
      };
    });
    const aiName = registry.get('ai').name;
    const order = registry.updateOrder.map((system) => system.name);
    const flightDiagnostics = state.flightRuntime && state.flightRuntime.diagnostics;
    const factionFires = trace.rows.filter((row) => row.event === 'combat:fire' && actorIds.has(row.ownerId));
    const factionHits = trace.rows.filter((row) => row.event === 'projectile:hit' && actorIds.has(row.ownerId));
    const postDisableFireEvents = disabledTick == null ? [] : factionFires.filter((row) => row.tick > disabledTick);
    const disabledEvent = trace.rows.find((row) => row.event === 'combat:subsystemDisabled'
      && row.targetId === setup.disableTarget.id && row.subsystemId === 'subsystem_drive') || null;
    return {
      factionId,
      sectorId,
      actorCount: actors.length,
      profiles: uniqueSorted(profiles.map((profile) => stableProfile(profile))),
      observed: {
        decisions: observed.decisions,
        maneuverKinds: sorted(observed.maneuverKinds),
        objectiveKinds: sorted(observed.objectiveKinds),
        formationKinds: sorted(observed.formationKinds),
        doctrinePhases: sorted(observed.doctrinePhases),
        tactics: sorted(observed.tactics),
        preferredRanges: [...observed.preferredRanges].sort((a, b) => a - b),
        pursuitCommitments: [...observed.pursuitCommitments].sort((a, b) => a - b),
        targetedIds: [...observed.targetedIds].sort((a, b) => Number(a) - Number(b)),
      },
      actors: actorRows,
      maxDisplacement: Math.max(...actorRows.map((row) => row.displacement)),
      maxPathDistance: Math.max(...actorRows.map((row) => row.pathDistance)),
      allDynamic: actorRows.every((row) => row.dynamic),
      acceptedManeuvers: portDiagnostics.acceptedManeuvers,
      flushedManeuvers: portDiagnostics.flushedManeuvers,
      backend: physicsDiagnostics && physicsDiagnostics.backend,
      sg02Ready: physicsDiagnostics && physicsDiagnostics.sg02Ready === true,
      aiName,
      selectedFlightIsV3: registry.get('flight') === flightV3,
      flightDiagnostics: flightDiagnostics ? {
        shipId: flightDiagnostics.shipId,
        driveId: flightDiagnostics.driveId,
        family: flightDiagnostics.family,
        mode: flightDiagnostics.mode,
      } : null,
      presenceBeforeAI: order.indexOf('factionPresence') >= 0
        && order.indexOf('factionPresence') < order.indexOf(aiName),
      provokedTick,
      disableEvidence: disabledEvent ? {
        source: factionId === 'faction_fulfillment' ? 'live_emp_projectile'
          : fixtureDisableApplied ? 'production_kernel_fixture_after_live_projectile' : 'live_projectile',
        fixtureDisableTick,
        event: disabledEvent,
      } : null,
      postDisable: {
        fireTicks: [...postDisableFireTicks],
        damagingDecisionTicks: [...postDisableDamagingDecisionTicks],
        fireEvents: postDisableFireEvents,
        targetAlive: setup.disableTarget.alive !== false && setup.disableTarget.hull > 0,
      },
      combatEvidence: {
        factionFireCount: factionFires.length,
        factionProjectileHitCount: factionHits.length,
        firedWeaponIds: uniqueSorted(factionFires.map((row) => row.weaponId)),
        shots: factionFires.map((row) => ({
          tick: row.tick, ownerId: row.ownerId, targetId: row.targetId, weaponId: row.weaponId,
          hardpointIdx: row.hardpointIdx, facing: row.facing,
          distance: row.distance, aimError: row.aimError,
        })),
        projectileHits: factionHits.map((row) => ({
          tick: row.tick, ownerId: row.ownerId, targetId: row.targetId, weaponId: row.weaponId,
        })),
        chain: selectEvidenceChain(trace.rows, { state, player, actors, setup }),
      },
      ...(factionId === 'faction_pitborn' ? {
        playerNeutralAtStart: pitbornNeutralAtStart,
        playerNeutralAtEnd: actors.every((actor) => !isHostileForAI(state, actor, player)),
        concordHostileAtStart: pitbornHostileToConcordAtStart,
        concordCount: setup.concords.length,
        targetedConcordIds: [...observed.pitbornTargetedConcordIds].sort((a, b) => Number(a) - Number(b)),
        promotedAtTick,
        reboundTargetId: actors[0].data.ai.retaliationTargetId,
        concordWasProductionPatrol: setup.concords.every((concord) => concord.factionId === 'faction_scn'
          && concord.data && concord.data.lootTableId === 'patrol_lawman'),
      } : {}),
      ...(factionId === 'faction_fulfillment' ? {
        atlasIds: setup.atlases.map((actor) => actor.id),
        boardingPhase: state.factionPresence && state.factionPresence.boarding
          && state.factionPresence.boarding.phase || null,
        playerHullAlive: player.alive !== false && player.hull > 0,
      } : {}),
    };
  } finally {
    trace.dispose();
    harness.dispose();
  }
}

function prepareScenarioGeometry({ factionId, state, helpers, player, actors }) {
  const origin = point(player.pos);
  placeEntity(player, origin.x, origin.z, 0);
  player.hull = player.hullMax = Math.max(5000, player.hullMax || 0);
  player.shield = player.shieldMax = 0;
  player.armorHp = player.armorMax = 0;
  const setup = {
    provokeTarget: null,
    disableTarget: player,
    concords: [],
    atlases: [],
  };

  if (factionId === 'faction_understory' || factionId === 'faction_archive') {
    // Sector entry may materialize a lawful station at the coordinate origin. Retaliation staged
    // inside its patrol bubble is correctly jurisdiction-blocked, so put this isolated exchange
    // well outside that bubble while keeping the production sector and actors unchanged.
    const exchange = { x: origin.x + 2200, z: origin.z + 1600 };
    placeEntity(player, exchange.x, exchange.z, 0);
    placeEntity(actors[0], factionId === 'faction_archive' ? exchange.x - 440 : exchange.x + 220,
      exchange.z, factionId === 'faction_archive' ? 0 : Math.PI);
    actors[0].data.ai.activity = {
      ...(actors[0].data.ai.activity || {}),
      anchor: point(actors[0].pos),
    };
    setup.provokeTarget = actors[0];
  } else if (factionId === 'faction_fulfillment') {
    setup.atlases = actors.filter((actor) => actor.data && actor.data.defId === 'ship_atlas');
    assert(setup.atlases.length > 0, 'Fulfillment route must include an existing Atlas EMP carrier');
    const administrativeTarget = actors.find((actor) => !setup.atlases.includes(actor));
    assert(administrativeTarget, 'Fulfillment route must include a non-Atlas ship for player provocation');
    placeEntity(administrativeTarget, origin.x, origin.z + 220, -Math.PI / 2);
    setup.provokeTarget = administrativeTarget;
    let atlasIndex = 0;
    for (const atlas of setup.atlases) {
      placeEntity(atlas, origin.x - 440, origin.z + (atlasIndex - (setup.atlases.length - 1) / 2) * 140, 0);
      atlasIndex++;
    }
    for (const actor of actors) {
      if (actor === administrativeTarget || setup.atlases.includes(actor)) continue;
      placeEntity(actor, origin.x, origin.z + 320, -Math.PI / 2);
    }
  } else if (factionId === 'faction_pitborn') {
    placeEntity(player, origin.x, origin.z + 2400, 0);
    placeEntity(actors[0], origin.x, origin.z, 0);
    setup.concords = [
      helpers.spawnEntity(makeEnemySpawnSpec('patrol_lawman', 3, { x: origin.x + 380, z: origin.z })),
      helpers.spawnEntity(makeEnemySpawnSpec('patrol_lawman', 3, { x: origin.x + 470, z: origin.z + 70 })),
    ];
    for (let index = 0; index < setup.concords.length; index++) {
      const concord = setup.concords[index];
      assert.equal(concord.factionId, 'faction_scn', 'Pitborn fixture must use production Concord patrols');
      placeEntity(concord, origin.x + 380 + index * 90, origin.z + index * 70, Math.PI);
      concord.hull = concord.hullMax = Math.max(1000, concord.hullMax || 0);
      concord.shield = concord.shieldMax = 0;
      concord.armorHp = concord.armorMax = 0;
    }
    setup.disableTarget = setup.concords[1];
  } else if (factionId === 'faction_verge_layers') {
    const center = (actors.length - 1) / 2;
    actors.forEach((actor, index) => {
      placeEntity(actor, origin.x - 500, origin.z + (index - center) * 90, 0);
    });
  }
  return setup;
}

function placeEntity(entity, x, z, rot = 0) {
  if (!entity) return;
  entity.pos.x = x;
  entity.pos.z = z;
  if (entity.prevPos) {
    entity.prevPos.x = x;
    entity.prevPos.z = z;
  }
  if (entity.vel) {
    entity.vel.x = 0;
    entity.vel.z = 0;
  }
  entity.rot = rot;
  entity.prevRot = rot;
  entity.angVel = 0;
}

function installEventTrace(bus, state) {
  const rows = [];
  const events = [
    'combat:fire',
    'projectile:hit',
    'combat:damage',
    'combat:subsystemDisabled',
    'factionPresence:boardingPhase',
    'entity:killed',
  ];
  const unsubs = events.map((event) => bus.on(event, (payload = {}) => {
    const owner = payload.ownerId == null ? null : state.entities.get(payload.ownerId);
    const inferredTargetId = event === 'combat:fire' && owner && owner.data
      ? (owner.data.combat && owner.data.combat.targetId)
        ?? (owner.data.ai && owner.data.ai.retaliationTargetId)
        ?? null
      : null;
    const targetId = payload.targetId ?? inferredTargetId;
    const target = targetId == null ? null : state.entities.get(targetId);
    const mount = event === 'combat:fire' && owner && owner.data && Array.isArray(owner.data.weapons)
      ? owner.data.weapons.find((weapon) => weapon.slotIndex === payload.hardpointIdx) || null
      : null;
    const shotDistance = event === 'combat:fire' && owner && target
      ? distance(owner.pos, target.pos) : null;
    const directAngle = event === 'combat:fire' && owner && target
      ? Math.atan2(target.pos.z - owner.pos.z, target.pos.x - owner.pos.x) : null;
    rows.push({
      event,
      tick: state.tick | 0,
      ownerId: payload.ownerId ?? null,
      attackerId: payload.attackerId ?? null,
      targetId,
      weaponId: payload.weaponId ?? null,
      hardpointIdx: payload.hardpointIdx ?? null,
      facing: mount && mount.facing || null,
      distance: shotDistance == null ? null : round3(shotDistance),
      aimError: directAngle == null || !Number.isFinite(payload.dir) ? null
        : round3(Math.abs(wrapAngle(payload.dir - directAngle))),
      subsystemId: payload.subsystemId ?? null,
      phase: payload.phase ?? null,
      id: payload.id ?? null,
      factionId: payload.factionId ?? null,
      applied: round3(payload.applied),
    });
  }));
  return {
    rows,
    dispose() {
      for (const unsub of unsubs) if (typeof unsub === 'function') unsub();
    },
  };
}

function applyDriveDisableFixture(registry, attacker, target, factionId) {
  target.shield = target.shieldMax = 0;
  target.armorHp = target.armorMax = 0;
  let result = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    result = registry.get('combat').ensureKernel().routeDamage({
      attackerId: attacker.id,
      targetId: target.id,
      packet: {
        channels: { ion: 45 },
        penetration: 0,
        shieldBypass: 1,
        subsystemShare: 1,
        hit: { subsystemId: 'subsystem_drive' },
        flags: { ignoreFriendlyFire: true },
      },
      origin: { kind: 'behavior_fixture', id: `k1_${factionId}_post_projectile_disable` },
    });
    assert.equal(result.ok, true, `${factionId} post-projectile disable fixture must route through combat`);
    if (result.subsystemResult && result.subsystemResult.after === 0) break;
  }
  assert.equal(result && result.subsystemResult && result.subsystemResult.after, 0,
    `${factionId} post-projectile fixture must schedule a real drive transition`);
}

function selectEvidenceChain(rows, { player, actors, setup }) {
  const actorIds = new Set(actors.map((actor) => actor.id));
  const atlasIds = new Set(setup.atlases.map((actor) => actor.id));
  const empActorIds = new Set(actors
    .filter((actor) => actor.data && Array.isArray(actor.data.weapons)
      && actor.data.weapons.some((weapon) => weapon && weapon.damageType === 'emp'))
    .map((actor) => actor.id));
  const chain = [];
  let cursor = -1;
  const take = (label, predicate) => {
    const index = rows.findIndex((row, rowIndex) => rowIndex > cursor && predicate(row));
    if (index < 0) return null;
    cursor = index;
    const entry = { label, ...rows[index] };
    chain.push(entry);
    return entry;
  };

  if (setup.provokeTarget) {
    take('player_fire', (row) => row.event === 'combat:fire' && row.ownerId === player.id);
    take('player_projectile_hit', (row) => row.event === 'projectile:hit'
      && row.ownerId === player.id && row.targetId === setup.provokeTarget.id);
    take('player_damage_provokes', (row) => row.event === 'combat:damage'
      && row.attackerId === player.id && row.targetId === setup.provokeTarget.id && row.applied > 0);
  }

  if (setup.concords.length === 2) {
    take('pitborn_emp_fire_first_concord', (row) => row.event === 'combat:fire'
      && empActorIds.has(row.ownerId) && row.targetId === setup.concords[0].id
      && row.weaponId === 'wpn_emp_disruptor_m');
    take('pitborn_emp_hit_first_concord', (row) => row.event === 'projectile:hit'
      && empActorIds.has(row.ownerId) && row.targetId === setup.concords[0].id
      && row.weaponId === 'wpn_emp_disruptor_m');
    take('first_concord_killed', (row) => row.event === 'entity:killed' && row.id === setup.concords[0].id);
    take('pitborn_emp_fire_promoted_concord', (row) => row.event === 'combat:fire'
      && empActorIds.has(row.ownerId) && row.targetId === setup.concords[1].id
      && row.weaponId === 'wpn_emp_disruptor_m');
    take('pitborn_emp_hit_promoted_concord', (row) => row.event === 'projectile:hit'
      && empActorIds.has(row.ownerId) && row.targetId === setup.concords[1].id
      && row.weaponId === 'wpn_emp_disruptor_m');
  } else {
    const empOnly = empActorIds.size > 0;
    const requiredOwnerIds = atlasIds.size > 0 ? atlasIds : (empOnly ? empActorIds : actorIds);
    const fireLabel = atlasIds.size > 0 ? 'atlas_emp_fire' : empOnly ? 'faction_emp_fire' : 'faction_fire';
    const hitLabel = atlasIds.size > 0 ? 'atlas_emp_projectile_hit'
      : empOnly ? 'faction_emp_projectile_hit' : 'faction_projectile_hit';
    take(fireLabel, (row) => row.event === 'combat:fire'
      && requiredOwnerIds.has(row.ownerId) && (!empOnly || row.weaponId === 'wpn_emp_disruptor_m'));
    take(hitLabel, (row) => row.event === 'projectile:hit'
      && actorIds.has(row.ownerId) && row.targetId === setup.disableTarget.id
      && requiredOwnerIds.has(row.ownerId) && (!empOnly || row.weaponId === 'wpn_emp_disruptor_m'));
  }
  const disabled = take('drive_disabled', (row) => row.event === 'combat:subsystemDisabled'
    && row.targetId === setup.disableTarget.id && row.subsystemId === 'subsystem_drive');
  // The boarding listener synchronously emits its nested phase event before later observers receive
  // the outer subsystem-disabled event. Reconstruct the semantic cause/effect order by tick rather
  // than treating listener registration order as gameplay chronology.
  const blackout = rows.find((row) => row.event === 'factionPresence:boardingPhase'
    && row.phase === 'blackout' && (!disabled || row.tick >= disabled.tick));
  if (blackout) chain.push({ label: 'boarding_blackout', ...blackout });
  return chain;
}

async function captureVergeNeutralControl() {
  const harness = await makeHarness('sector_veil_nebula');
  const { state, bus, registry, player } = harness;
  const trace = installEventTrace(bus, state);
  try {
    state.story.verge = {
      revealed: true,
      awake: true,
      valeGatesRevoked: true,
      playerUsedClosureProtocol: false,
      evidence: { kellPaperTrail: true, archiveFile: true, kurtzLedger: true },
      revocations: [{ evidenceId: 'vale_gate_revocation_file' }],
    };
    bus.emit('sector:enter', { sectorId: 'sector_veil_nebula' });
    const actors = state.entityList.filter((entity) => entity && entity.alive !== false
      && entity.factionId === 'faction_verge_layers');
    assert(actors.length > 0, 'Vale-revocation control must materialize observer prisms');
    const origin = point(player.pos);
    actors.forEach((actor, index) => placeEntity(actor, origin.x - 480, origin.z + index * 80, 0));
    state.spatialHash.rebuild(state.entityList);
    let targetedPlayer = false;
    for (let tick = 0; tick < 180; tick++) {
      registry.step(DT);
      const result = registry.get('tacticalAI').inspect().lastResult;
      for (const decision of result && result.decisions || []) {
        if (!actors.some((actor) => actor.id === decision.entityId)) continue;
        const objectiveTarget = decision.directive && decision.directive.objective
          && decision.directive.objective.targetId;
        const doctrineTarget = decision.combatDoctrine && decision.combatDoctrine.targetId;
        if (objectiveTarget === player.id || doctrineTarget === player.id) targetedPlayer = true;
      }
    }
    const actorIds = new Set(actors.map((actor) => actor.id));
    return {
      actorCount: actors.length,
      allPassive: actors.every((actor) => actor.data && actor.data.ai && actor.data.ai.passive === true),
      allPlayerNeutral: actors.every((actor) => !isHostileForAI(state, actor, player)),
      targetedPlayer,
      fireCount: trace.rows.filter((row) => row.event === 'combat:fire' && actorIds.has(row.ownerId)).length,
      allDynamic: actors.every((actor) => {
        const telemetry = readPhysicsTelemetry(actor);
        return !!telemetry && telemetry.dynamic === true && telemetry.mode === 'rapier-dynamic';
      }),
      selectedFlightIsV3: registry.get('flight') === flightV3,
    };
  } finally {
    trace.dispose();
    harness.dispose();
  }
}

async function makeHarness(sectorId) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.tutorialHints = false;
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, clonePlain(sector)]));
  state.world.currentSectorId = sectorId;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  const registry = createRegistry(ctx);
  ctx.registry = registry;
  for (const system of registry.systems) {
    if (HEADLESS_SKIP.has(system.name)) continue;
    if (typeof system.init === 'function') system.init(ctx);
  }
  assert.equal(registry.get('ai'), registry.get('tacticalAI'), 'live registry must select SG-06');
  const physics = registry.get('physics');
  const ready = await physics.prepareBackend(state, { reset: true });
  assert.equal(ready, true, 'live K1 capture requires Rapier authority before the first tick');

  const origin = sectorGlobalOrigin(sectorId);
  const player = helpers.spawnEntity(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: origin.x, z: origin.z },
  }));
  state.playerId = player.id;
  return {
    state,
    bus,
    helpers,
    registry,
    player,
    dispose() {
      registry.destroy();
    },
  };
}

function configureScenarioState(state, factionId, sectorId) {
  if (factionId === 'faction_understory') {
    const loss = {
      lossId: 'loss_k1_behavior_capture',
      sectorId,
      shipDefId: 'ship_ironback',
      factionId: 'faction_dmc',
      kind: 'ship',
      source: 'entity:killed',
      t: 0,
    };
    state.lossLedger.entries = [loss];
    state.lossLedger.bySector = { [sectorId]: [loss] };
  }
  if (factionId === 'faction_verge_layers') {
    state.story.verge = {
      revealed: true,
      awake: true,
      valeGatesRevoked: true,
      playerUsedClosureProtocol: true,
      evidence: { kellPaperTrail: true, archiveFile: true, kurtzLedger: true },
      revocations: [
        { evidenceId: 'kell_paper_trail' },
        { evidenceId: 'vale_gate_revocation_file' },
        { evidenceId: 'kurtz_ledger' },
      ],
    };
  }
}

function observeTacticalResult(result, actorIds, concords, observed) {
  if (!result) return;
  const concordIds = new Set((concords || []).map((concord) => concord.id));
  for (const squad of result.squads || []) {
    if (!(squad.directives || []).some((directive) => actorIds.has(directive.memberId))) continue;
    if (squad.tactic) observed.tactics.add(squad.tactic);
    if (squad.factionBehavior && Number.isFinite(squad.factionBehavior.pursuitCommitment)) {
      observed.pursuitCommitments.add(squad.factionBehavior.pursuitCommitment);
    }
  }
  for (const decision of result.decisions || []) {
    if (!actorIds.has(decision.entityId)) continue;
    observed.decisions++;
    if (decision.maneuver && decision.maneuver.kind) observed.maneuverKinds.add(decision.maneuver.kind);
    const directive = decision.directive || {};
    if (directive.objective && directive.objective.kind) observed.objectiveKinds.add(directive.objective.kind);
    if (directive.formation && directive.formation.kind) observed.formationKinds.add(directive.formation.kind);
    if (decision.combatDoctrine && decision.combatDoctrine.phase) {
      observed.doctrinePhases.add(decision.combatDoctrine.phase);
    }
    if (decision.combatDoctrine && Number.isFinite(decision.combatDoctrine.preferredRange)) {
      observed.preferredRanges.add(round3(decision.combatDoctrine.preferredRange));
    }
    const targetId = decision.combatDoctrine && decision.combatDoctrine.targetId != null
      ? decision.combatDoctrine.targetId
      : directive.objective && directive.objective.targetId;
    if (targetId != null) observed.targetedIds.add(targetId);
    if (concordIds.has(targetId)) {
      observed.pitbornTargetedConcordIds.add(targetId);
    }
  }
}

function assertReport(report) {
  assert.equal(report.schema, 'spaceface.depth-program-k1.behavior.v2');
  assert.deepEqual(report.productionPath, {
    registryStep: true,
    aiBackend: 'sg06-tactical',
    physicsBackend: 'rapier-dynamic',
    flightBackend: 'v3',
  });
  assert.equal(report.scenarios.length, SCENARIOS.length, 'capture must cover all five K1 factions');
  const byFaction = new Map(report.scenarios.map((scenario) => [scenario.factionId, scenario]));
  assert.equal(byFaction.size, SCENARIOS.length, 'each K1 faction needs exactly one live scenario');
  const liveTraceSignatures = new Set();
  const profileSignatures = new Set();
  for (const { factionId } of SCENARIOS) {
    const scenario = byFaction.get(factionId);
    assert(scenario, `${factionId} behavior report missing`);
    assert.equal(scenario.backend, 'rapier-dynamic', `${factionId} must run against Rapier`);
    assert.equal(scenario.sg02Ready, true, `${factionId} must see ready SG-02 diagnostics`);
    assert.equal(scenario.aiName, 'tacticalAI', `${factionId} must run through tacticalAI`);
    assert.equal(scenario.presenceBeforeAI, true, `${factionId} route state must settle before tacticalAI`);
    assert.equal(scenario.selectedFlightIsV3, true, `${factionId} must use the selected V3 flight system`);
    assert(scenario.flightDiagnostics, `${factionId} must publish live V3 flight diagnostics`);
    assert.equal(scenario.allDynamic, true, `${factionId} actors must be Rapier dynamic bodies`);
    assert(scenario.acceptedManeuvers > 0 && scenario.flushedManeuvers > 0,
      `${factionId} maneuvers must cross the live aiPorts/physics membrane`);
    assert(scenario.observed.decisions > 0, `${factionId} must produce live tactical decisions`);
    assert(scenario.observed.preferredRanges.length > 0,
      `${factionId} must log engagement ranges consumed by live combat decisions`);
    assert(scenario.observed.pursuitCommitments.length > 0,
      `${factionId} must log pursuit commitments installed on production actors`);
    assert(scenario.maxPathDistance > 0, `${factionId} must move through the live physics path`);
    assert(scenario.combatEvidence.factionFireCount > 0, `${factionId} must emit production combat fire`);
    assert(scenario.combatEvidence.factionProjectileHitCount > 0,
      `${factionId} must land a production projectile before any disable fixture`);
    assert(scenario.disableEvidence, `${factionId} must produce a canonical drive-disabled transition`);
    assert.equal(scenario.postDisable.targetAlive, true, `${factionId} non-lethal target must survive`);
    assert.deepEqual(scenario.postDisable.fireTicks, [], `${factionId} intent.fire must fail closed after disable`);
    assert.deepEqual(scenario.postDisable.damagingDecisionTicks, [],
      `${factionId} must produce no fresh damaging decision after disable`);
    assert.deepEqual(scenario.postDisable.fireEvents, [], `${factionId} must emit no fire after disable`);
    assert(scenario.profiles.length > 0, `${factionId} must report sampled production doctrine`);
    profileSignatures.add(JSON.stringify(scenario.profiles));
    liveTraceSignatures.add(JSON.stringify({
      maneuvers: scenario.observed.maneuverKinds,
      objectives: scenario.observed.objectiveKinds,
      formations: scenario.observed.formationKinds,
      tactics: scenario.observed.tactics,
      ranges: scenario.observed.preferredRanges,
      pursuit: scenario.observed.pursuitCommitments,
      weapons: scenario.combatEvidence.firedWeaponIds,
      evidence: scenario.combatEvidence.chain.map((row) => row.label),
      pathDistance: scenario.maxPathDistance,
    }));
  }
  assert.equal(liveTraceSignatures.size, SCENARIOS.length,
    'all five stimulated production traces must remain measurably distinct');
  assert.equal(profileSignatures.size, SCENARIOS.length,
    'sampled doctrine rows remain distinct as supplemental data evidence');

  const understory = byFaction.get('faction_understory');
  assertEvidenceChain(understory, [
    'player_fire', 'player_projectile_hit', 'player_damage_provokes',
    'faction_emp_fire', 'faction_emp_projectile_hit', 'drive_disabled',
  ]);

  const fulfillment = byFaction.get('faction_fulfillment');
  assert.equal(fulfillment.actorCount, 3, 'Fulfillment fixed route must be the authored three-ship formation');
  assert(fulfillment.maxDisplacement > 20, 'Fulfillment must physically traverse its route under Rapier');
  assert(fulfillment.observed.formationKinds.includes('line'), 'Fulfillment must consume its sampled line formation');
  assert.equal(fulfillment.disableEvidence.source, 'live_emp_projectile',
    'Fulfillment disable may not use a direct-damage fixture');
  assert.equal(fulfillment.disableEvidence.fixtureDisableTick, null);
  assert(fulfillment.atlasIds.includes(fulfillment.disableEvidence.event.attackerId),
    'the live disable must be attributed to an authored-route Atlas');
  assert.equal(fulfillment.playerHullAlive, true);
  assertEvidenceChain(fulfillment, [
    'player_fire', 'player_projectile_hit', 'player_damage_provokes',
    'atlas_emp_fire', 'atlas_emp_projectile_hit', 'drive_disabled', 'boarding_blackout',
  ]);

  const archive = byFaction.get('faction_archive');
  assertEvidenceChain(archive, [
    'player_fire', 'player_projectile_hit', 'player_damage_provokes',
    'faction_emp_fire', 'faction_emp_projectile_hit', 'drive_disabled',
  ]);

  const pitborn = byFaction.get('faction_pitborn');
  assert.equal(pitborn.playerNeutralAtStart, true, 'ordinary Pitborn presence must begin player-neutral');
  assert.equal(pitborn.playerNeutralAtEnd, true, 'ordinary Pitborn presence must remain player-neutral');
  assert.equal(pitborn.concordHostileAtStart, true, 'Pitborn must recognize the real Concord patrol as hostile');
  assert.equal(pitborn.concordWasProductionPatrol, true, 'Pitborn target must be a production Concord actor');
  assert.equal(pitborn.concordCount, 2);
  assert.equal(pitborn.targetedConcordIds.length, 2,
    'Pitborn must target both production Concord actors through the live tactical stack');
  assert(Number.isInteger(pitborn.promotedAtTick), 'Pitborn must promote after the first live projectile hit');
  assert.equal(pitborn.reboundTargetId, pitborn.targetedConcordIds[1]);
  assert(pitborn.maxDisplacement > 10, 'Pitborn must physically maneuver against Concord under Rapier');
  assertEvidenceChain(pitborn, [
    'pitborn_emp_fire_first_concord', 'pitborn_emp_hit_first_concord', 'first_concord_killed',
    'pitborn_emp_fire_promoted_concord', 'pitborn_emp_hit_promoted_concord', 'drive_disabled',
  ]);

  const verge = byFaction.get('faction_verge_layers');
  assert(verge.observed.targetedIds.includes(1), 'active Verge response must target the gate-closing player');
  assertEvidenceChain(verge, ['faction_emp_fire', 'faction_emp_projectile_hit', 'drive_disabled']);
  assert.equal(report.vergeNeutralControl.actorCount > 0, true);
  assert.equal(report.vergeNeutralControl.allPassive, true);
  assert.equal(report.vergeNeutralControl.allPlayerNeutral, true);
  assert.equal(report.vergeNeutralControl.targetedPlayer, false);
  assert.equal(report.vergeNeutralControl.fireCount, 0);
  assert.equal(report.vergeNeutralControl.allDynamic, true);
  assert.equal(report.vergeNeutralControl.selectedFlightIsV3, true);
}

function assertEvidenceChain(scenario, expectedLabels) {
  const chain = scenario.combatEvidence.chain;
  assert.deepEqual(chain.map((row) => row.label), expectedLabels,
    `${scenario.factionId} semantic event chain must be complete`);
  for (let index = 1; index < chain.length; index++) {
    assert(chain[index].tick >= chain[index - 1].tick,
      `${scenario.factionId} evidence must remain causally ordered`);
  }
}

function stableProfile(profile) {
  return {
    pursuitCommitment: profile.pursuitCommitment,
    preferredRange: profile.preferredRange,
    liveFormation: profile.liveFormation,
    retreatHullFraction: profile.retreatHullFraction,
    combatDoctrineId: profile.combatDoctrineId,
    disableThenRun: profile.disableThenRun,
    firstFire: profile.firstFire,
    firstFireAgainst: [...profile.firstFireAgainst],
    firstFireCondition: profile.firstFireCondition,
    stationDefenseAggression: profile.stationDefenseAggression,
    disableChance: profile.disableChance,
    destroyTarget: profile.destroyTarget,
    fixedRoute: profile.fixedRoute,
  };
}

function uniqueSorted(values) {
  const map = new Map(values.map((value) => [JSON.stringify(value), value]));
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
}

function sorted(values) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b)));
}

function point(value) {
  return { x: Number(value && value.x) || 0, z: Number(value && value.z) || 0 };
}

function distance(a, b) {
  return Math.hypot((a && a.x || 0) - (b && b.x || 0), (a && a.z || 0) - (b && b.z || 0));
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function wrapAngle(value) {
  return Math.atan2(Math.sin(Number(value) || 0), Math.cos(Number(value) || 0));
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function installHeadlessBrowserStubs() {
  const previous = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
    document: globalThis.document,
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    __SF_PUBLISH_SG02_TELEMETRY__: globalThis.__SF_PUBLISH_SG02_TELEMETRY__,
  };
  const listeners = new Map();
  globalThis.addEventListener = (type, fn) => {
    let set = listeners.get(type);
    if (!set) listeners.set(type, set = new Set());
    set.add(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    const set = listeners.get(type);
    if (set) set.delete(fn);
  };
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  globalThis.document = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    getElementById() { return null; },
    querySelector() { return null; },
    createElement() {
      return {
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        appendChild() {},
        remove() {},
        setAttribute() {},
        addEventListener() {},
        querySelector() { return null; },
        innerHTML: '',
        textContent: '',
      };
    },
    head: { appendChild() {} },
    body: { appendChild() {} },
  };
  globalThis.window = globalThis;
  globalThis.__SF_PUBLISH_SG02_TELEMETRY__ = true;
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    key() { return null; },
    clear() {},
    get length() { return 0; },
  };
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}
