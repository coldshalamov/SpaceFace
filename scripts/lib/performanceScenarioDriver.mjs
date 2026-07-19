import {
  PERFORMANCE_SCENARIO_IDS,
  performanceScenario,
  resolvePerformanceScenarios,
} from './performanceClosureContracts.mjs';

const ROUTE_ORDER = Object.freeze([
  'docked_market_ui',
  'flight_steady',
  'fleet_full_render_10',
  'fleet_full_render_25',
  'fleet_full_render_50',
  'fleet_transparent_heavy',
  'station_arrival_approach',
  'station_visible_steady',
  'mining_tether_active',
  'combat_vfx_burst',
  'autosave_under_load',
  'map_open',
  'map_interaction_steady',
  'map_to_flight_transition',
  'context_recover_steady',
  'jump_asset_admission',
]);

export function performanceScenarioExecutionOrder(ids = PERFORMANCE_SCENARIO_IDS) {
  const selected = resolvePerformanceScenarios(ids).map((definition) => definition.id);
  return [
    ...ROUTE_ORDER.filter((id) => selected.includes(id)),
    ...selected.filter((id) => !ROUTE_ORDER.includes(id)),
  ];
}

export function performanceScenarioHoldsMeasuredPose(definition) {
  return definition?.injectedState === true && definition?.transitionWindow !== true;
}

export async function preparePerformanceScenario(page, scenarioId, { seed = 47, log = () => {} } = {}) {
  const definition = performanceScenario(scenarioId);
  if (!definition) throw new Error(`unknown performance scenario: ${scenarioId}`);
  if (!Number.isInteger(seed)) throw new Error('performance scenario seed must be an integer');
  const holdsMeasuredPose = performanceScenarioHoldsMeasuredPose(definition);
  const receipt = await page.evaluate(async ({ id, fleetCount, scenarioSeed, holdsMeasuredPose }) => {
    const sf = window.SF;
    const state = sf?.state;
    const helpers = sf?.helpers;
    const player = state?.entities?.get?.(state.playerId);
    if (!state || !helpers || !player) throw new Error(`scenario ${id} requires the live game state and player`);
    if (window.__SF_PERFORMANCE_SCENARIO_RESTORE__) throw new Error('another performance scenario is already active');

    const snapshot = {
      id,
      seed: scenarioSeed,
      injectedIds: [],
      activityTimer: null,
      timeScale: state.timeScale,
      playerTargetId: state.player?.targetId ?? null,
      flybyFocus: id.startsWith('station_') && state.player?.flybyFocus
        ? { ...state.player.flybyFocus }
        : null,
      isolatesFlybyFocus: false,
      player: {
        pos: vector(player.pos),
        prevPos: vector(player.prevPos),
        vel: vector(player.vel),
        rot: player.rot,
        prevRot: player.prevRot,
        noInterp: player.flags?.noInterp === true,
      },
      entityCount: state.entityList.length,
      currentSectorId: state.world?.currentSectorId || null,
      resourceStartTime: performance.now(),
    };
    window.__SF_PERFORMANCE_SCENARIO_RESTORE__ = snapshot;

    // The public route deliberately proves ordinary thrust before attribution begins. Synthetic
    // render scenarios can then spend several seconds admitting authored ships while that retained
    // velocity carries the camera away from the fleet that was placed around its starting pose.
    // Hold the player at the journaled pose for steady-state measurement so admission latency does
    // not silently change culling, LOD, draw count, or triangle count between comparable runs.
    if (holdsMeasuredPose) {
      player.vel.set(0, 0, 0);
      player.prevPos.copy(player.pos);
      snapshot.physicsPoseSynchronized = syncPlayerPhysics(player, snapshot.player.noInterp);
    }

    const spawnFleet = async (count, { transparentHeavy = false, combat = false } = {}) => {
      const { makeShipEntitySpec } = await import('/src/systems/ships.js');
      const defs = transparentHeavy || combat ? ['ship_kestrel', 'ship_wasp'] : ['ship_kestrel'];
      for (let index = 0; index < count; index++) {
        const ring = Math.floor(index / 12);
        const slot = index % 12;
        const seedPhase = ((scenarioSeed % 997) + 997) % 997 / 997 * Math.PI * 2;
        const angle = (Math.PI * 2 * slot / 12) + ring * 0.17 + seedPhase;
        const radius = 75 + ring * 48;
        const spec = makeShipEntitySpec(defs[index % defs.length], {
          team: 2,
          factionId: 'faction_scn',
          pos: { x: player.pos.x + Math.cos(angle) * radius, z: player.pos.z + Math.sin(angle) * radius },
          rot: angle + Math.PI,
          ai: null,
        });
        spec.collides = false;
        spec.collisionMask = 0;
        spec.data.perfScenario = { id, index, diagnostic: true };
        const entity = helpers.spawnEntity(spec);
        entity.flags.boosting = transparentHeavy || combat;
        entity.data.intent = transparentHeavy || combat ? { thrust: 1, turn: 0, boost: true } : null;
        if (combat) {
          entity.hull = Math.max(1, entity.hullMax * (0.45 + (index % 4) * 0.1));
          entity.shield = Math.max(0, entity.shieldMax * (0.2 + (index % 3) * 0.2));
          entity.lastDamageT = state.simTime;
        }
        snapshot.injectedIds.push(entity.id);
      }
    };

    if (id.startsWith('fleet_full_render_')) await spawnFleet(fleetCount || Number(id.split('_').pop()));
    else if (id === 'fleet_transparent_heavy') await spawnFleet(fleetCount || 25, { transparentHeavy: true });
    else if (id === 'autosave_under_load') await spawnFleet(fleetCount || 25, { transparentHeavy: true });
    else if (id === 'combat_vfx_burst') {
      await spawnFleet(12, { transparentHeavy: true, combat: true });
      state.player.targetId = snapshot.injectedIds[0] || snapshot.playerTargetId;
      let burst = 0;
      snapshot.activityTimer = setInterval(() => {
        const targets = snapshot.injectedIds
          .map((entityId) => state.entities.get(entityId))
          .filter((entity) => entity?.alive !== false && entity?.type === 'ship');
        if (!targets.length) return;
        const target = targets[burst % targets.length];
        const angle = (burst % 16) * Math.PI / 8;
        const origin = { x: player.pos.x + Math.cos(angle) * 4, z: player.pos.z + Math.sin(angle) * 4 };
        const dir = Math.atan2(target.pos.z - origin.z, target.pos.x - origin.x);
        const weaponId = burst % 3 === 0 ? 'wpn_plasma_cannon_m' : 'wpn_pulse_laser_m';
        const projectile = helpers.spawnEntity({
          type: 'projectile',
          pos: origin,
          vel: { x: Math.cos(dir) * 260, z: Math.sin(dir) * 260 },
          rot: dir,
          radius: 0.7,
          mass: 0.1,
          team: player.team,
          ownerId: player.id,
          factionId: player.factionId,
          ttl: 1.5,
          collides: false,
          collisionMask: 0,
          data: { ownerId: player.id, weaponId, kind: 'bullet', perfScenario: id },
        });
        snapshot.injectedIds.push(projectile.id);
        sf.bus.emit('combat:fire', { ownerId: player.id, weaponId, hardpointIdx: 0, origin, dir });
        sf.bus.emit('projectile:hit', {
          ownerId: player.id,
          targetId: target.id,
          weaponId,
          damageType: weaponId.includes('plasma') ? 'thermal' : 'energy',
          pos: { x: target.pos.x, z: target.pos.z },
        });
        burst++;
      }, 120);
    } else if (id === 'station_arrival_approach' || id === 'station_visible_steady') {
      const station = state.entityList.find((entity) => entity?.alive !== false && entity.type === 'station');
      if (!station) throw new Error(`${id} requires a live station entity`);
      // The synthetic station pose can cross a naturally moving hostile and arm Flyby Focus. Its
      // 0.5 time lease then begins or expires inside the sample window, invalidating comparable
      // station cost and leaking into the next scenario. Cancel that unrelated encounter beat and
      // hold its cooldown beyond this diagnostic window; the exact focus journal is restored later.
      sf.bus?.emit?.('flybyFocus:cancel', { reason: 'performance-station-scenario' });
      if (state.player?.flybyFocus) {
        state.player.flybyFocus.cooldownUntil = Math.max(
          Number(state.player.flybyFocus.cooldownUntil) || 0,
          (Number(state.simTime) || 0) + 60,
        );
      }
      snapshot.isolatesFlybyFocus = true;
      const distance = id === 'station_arrival_approach' ? 520 : 150;
      player.pos.set(station.pos.x + distance, 0, station.pos.z);
      player.prevPos.copy(player.pos);
      player.vel.set(id === 'station_arrival_approach' ? -85 : 0, 0, 0);
      player.rot = Math.PI;
      player.prevRot = player.rot;
      snapshot.physicsPoseSynchronized = syncPlayerPhysics(player, snapshot.player.noInterp);
    }

    return {
      scenarioId: id,
      seed: scenarioSeed,
      stateInjected: snapshot.injectedIds.length > 0 || id.startsWith('station_'),
      injectedEntityCount: snapshot.injectedIds.length,
      injectedIds: [...snapshot.injectedIds],
      baselineEntityCount: snapshot.entityCount,
      resourceStartTime: snapshot.resourceStartTime,
      activity: snapshot.activityTimer != null,
      holdsMeasuredPose,
      physicsPoseSynchronized: snapshot.physicsPoseSynchronized === true,
    };

    function vector(value) {
      return { x: Number(value?.x) || 0, y: Number(value?.y) || 0, z: Number(value?.z) || 0 };
    }

    function syncPlayerPhysics(entity, restoreNoInterp) {
      if (!entity?.flags) return false;
      entity.flags.noInterp = true;
      const owner = sf.registry?.get?.('physics')?._sg02;
      if (owner && typeof owner.syncFromEntities === 'function') owner.syncFromEntities(state.entityList);
      const synchronized = entity.flags.noInterp !== true;
      entity.flags.noInterp = restoreNoInterp === true;
      return synchronized;
    }
  }, {
    id: scenarioId,
    fleetCount: definition.fleetCount || 0,
    scenarioSeed: seed,
    holdsMeasuredPose,
  });

  if (definition.actualRenderedEntitiesRequired) {
    await waitForPerformanceScenarioReady(page, scenarioId);
  }
  log(`[scenario] prepared ${scenarioId} injected=${receipt.injectedEntityCount}`);
  return { ...receipt, definition };
}

export async function waitForPerformanceScenarioReady(page, scenarioId, { timeoutMs = 120_000 } = {}) {
  await page.waitForFunction((expectedId) => {
    const sf = window.SF;
    const state = sf?.state;
    const snapshot = window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    if (!state || snapshot?.id !== expectedId) return false;
    const shipIds = snapshot.injectedIds.filter((id) => state.entities.get(id)?.type === 'ship');
    if (!shipIds.length) return false;
    for (const id of shipIds) {
      const entity = state.entities.get(id);
      if (!entity?.mesh) return false;
      if (entity.mesh.userData?.authoredAssetState !== 'authored') return false;
    }
    const renderSystem = sf.registry?.get?.('render');
    const queueRemaining = Array.isArray(renderSystem?._meshBuildQueue)
      ? Math.max(0, renderSystem._meshBuildQueue.length - (renderSystem._meshBuildQueueHead || 0))
      : 0;
    const upgrades = state.render?.scene?.userData?.authoredUpgradeDiagnostics;
    return queueRemaining === 0 && renderSystem?._meshReconcileDirty !== true && Number(upgrades?.activeJobs || 0) === 0;
  }, scenarioId, { timeout: timeoutMs });
  return page.evaluate((expectedId) => {
    const state = window.SF?.state;
    const snapshot = window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    const entities = snapshot?.injectedIds.map((id) => state.entities.get(id)).filter(Boolean) || [];
    return {
      scenarioId: expectedId,
      injectedAlive: entities.filter((entity) => entity.alive !== false).length,
      renderedShips: entities.filter((entity) => entity.type === 'ship' && entity.mesh).length,
      authoredShips: entities.filter((entity) => entity.type === 'ship' && entity.mesh?.userData?.authoredAssetState === 'authored').length,
    };
  }, scenarioId);
}

export async function restorePerformanceScenario(page, scenarioId, { log = () => {} } = {}) {
  const removal = await page.evaluate((expectedId) => {
    const sf = window.SF;
    const state = sf?.state;
    const snapshot = window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    if (!snapshot) return { scenarioId: expectedId, restored: true, reason: 'nothing-to-restore', injectedIds: [] };
    if (snapshot.id !== expectedId) throw new Error(`scenario restore mismatch: expected ${expectedId}, found ${snapshot.id}`);
    if (snapshot.activityTimer != null) clearInterval(snapshot.activityTimer);
    snapshot.activityTimer = null;
    for (const id of snapshot.injectedIds) sf.helpers.removeEntity(id);
    snapshot.restoreRequested = true;
    return { scenarioId: expectedId, injectedIds: [...snapshot.injectedIds], restoreRequested: true };
  }, scenarioId);

  if (removal.injectedIds?.length) {
    await page.waitForFunction((ids) => ids.every((id) => !window.SF?.state?.entities?.has?.(id)), removal.injectedIds, { timeout: 30_000 });
  }
  const receipt = await page.evaluate((expectedId) => {
    const sf = window.SF;
    const state = sf?.state;
    const snapshot = window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    if (!snapshot) return { scenarioId: expectedId, restored: true, reason: 'nothing-to-restore' };
    const player = state?.entities?.get?.(state.playerId);
    const remainingInjectedIds = snapshot.injectedIds.filter((id) => state.entities.has(id));
    const routeProgression = expectedId === 'jump_asset_admission';
    if (player && !routeProgression) {
      player.pos.set(snapshot.player.pos.x, snapshot.player.pos.y, snapshot.player.pos.z);
      player.prevPos.set(snapshot.player.prevPos.x, snapshot.player.prevPos.y, snapshot.player.prevPos.z);
      player.vel.set(snapshot.player.vel.x, snapshot.player.vel.y, snapshot.player.vel.z);
      player.rot = snapshot.player.rot;
      player.prevRot = snapshot.player.prevRot;
      if (player.flags) {
        player.flags.noInterp = true;
        const owner = sf.registry?.get?.('physics')?._sg02;
        if (owner && typeof owner.syncFromEntities === 'function') owner.syncFromEntities(state.entityList);
        player.flags.noInterp = snapshot.player.noInterp === true;
      }
    }
    if (snapshot.isolatesFlybyFocus) {
      // Clear any request created during the diagnostic arm before restoring the journal. The
      // player's target and derived timeScale are restored immediately below.
      sf.bus?.emit?.('flybyFocus:cancel', { reason: 'performance-station-restore' });
      if (snapshot.flybyFocus && state.player?.flybyFocus) {
        Object.assign(state.player.flybyFocus, snapshot.flybyFocus);
      }
    }
    state.timeScale = snapshot.timeScale;
    if (state.player && !routeProgression) state.player.targetId = snapshot.playerTargetId;
    const checks = routeProgression ? {
      injectedEntitiesRemoved: remainingInjectedIds.length === 0,
      timeScale: state.timeScale === snapshot.timeScale,
      activityStopped: snapshot.activityTimer == null,
      routeProgressed: state.world?.currentSectorId !== snapshot.currentSectorId,
    } : {
      injectedEntitiesRemoved: remainingInjectedIds.length === 0,
      timeScale: state.timeScale === snapshot.timeScale,
      playerTarget: state.player?.targetId === snapshot.playerTargetId,
      playerPosition: sameVector(player?.pos, snapshot.player.pos),
      playerPreviousPosition: sameVector(player?.prevPos, snapshot.player.prevPos),
      playerVelocity: sameVector(player?.vel, snapshot.player.vel),
      playerRotation: player?.rot === snapshot.player.rot && player?.prevRot === snapshot.player.prevRot,
      flybyFocus: !snapshot.isolatesFlybyFocus
        || sameFlybyFocus(state.player?.flybyFocus, snapshot.flybyFocus),
      activityStopped: snapshot.activityTimer == null,
      playerNoInterp: !player?.flags || player.flags.noInterp === snapshot.player.noInterp,
    };
    const restored = Object.values(checks).every(Boolean);
    delete window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    return {
      scenarioId: expectedId,
      restored,
      policy: routeProgression ? 'route-progression-cleanup-scoped' : 'exact-journal-restore',
      routeProgression: routeProgression ? {
        fromSectorId: snapshot.currentSectorId,
        toSectorId: state.world?.currentSectorId || null,
      } : null,
      checks,
      remainingInjectedIds,
    };

    function sameVector(actual, expected) {
      return Math.abs((actual?.x || 0) - expected.x) < 1e-6
        && Math.abs((actual?.y || 0) - expected.y) < 1e-6
        && Math.abs((actual?.z || 0) - expected.z) < 1e-6;
    }
    function sameFlybyFocus(actual, expected) {
      if (!expected) return actual == null;
      return Object.keys(expected).every((key) => actual?.[key] === expected[key]);
    }
  }, scenarioId);
  log(`[scenario] restored ${scenarioId} ok=${receipt.restored}`);
  return receipt;
}

export function validateScenarioRestoration(receipt) {
  const failures = [];
  if (!receipt || receipt.restored !== true) failures.push('scenario restoration must report restored=true');
  for (const [key, value] of Object.entries(receipt?.checks || {})) if (value !== true) failures.push(`scenario restoration check failed: ${key}`);
  if (Array.isArray(receipt?.remainingInjectedIds) && receipt.remainingInjectedIds.length) failures.push('injected entities remain after restoration');
  return { pass: failures.length === 0, failures };
}
