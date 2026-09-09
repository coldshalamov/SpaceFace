import {
  PERFORMANCE_SCENARIO_IDS,
  performanceScenario,
  performanceScenarioPipelineSettleTimeoutMs,
  resolvePerformanceScenarios,
} from './performanceClosureContracts.mjs';

export { performanceScenarioPipelineSettleTimeoutMs };

const ROUTE_ORDER = Object.freeze([
  'docked_market_ui',
  'flight_steady',
  'presentation_world_legacy_current',
  'presentation_world_dense_5x',
  'presentation_world_churn',
  'presentation_world_rebase',
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
  return definition?.holdsMeasuredPose === true
    || (definition?.injectedState === true && definition?.transitionWindow !== true);
}

export async function preparePerformanceScenario(page, scenarioId, { seed = 47, log = () => {} } = {}) {
  const definition = performanceScenario(scenarioId);
  if (!definition) throw new Error(`unknown performance scenario: ${scenarioId}`);
  if (!Number.isInteger(seed)) throw new Error('performance scenario seed must be an integer');
  const holdsMeasuredPose = performanceScenarioHoldsMeasuredPose(definition);
  const baselineSettle = definition.presentationWorldMode
    ? await waitForPresentationWorldBaseline(page, scenarioId)
    : null;
  const receipt = await page.evaluate(async ({ id, fleetCount, scenarioSeed, holdsMeasuredPose, presentationWorldMode }) => {
    const sf = window.SF;
    const state = sf?.state;
    const helpers = sf?.helpers;
    const player = state?.entities?.get?.(state.playerId);
    if (!state || !helpers || !player) throw new Error(`scenario ${id} requires the live game state and player`);
    if (window.__SF_PERFORMANCE_SCENARIO_RESTORE__) throw new Error('another performance scenario is already active');
    const renderSystem = sf.registry?.get?.('render');
    if (presentationWorldMode && (!renderSystem?._presentationWorld || !renderSystem?._meshes)) {
      throw new Error(`scenario ${id} requires the live PresentationWorld renderer`);
    }

    const snapshot = {
      id,
      seed: scenarioSeed,
      injectedIds: [],
      liveInjectedIds: [],
      retiredInjectedIds: [],
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
      miningDiagnosticArmed: false,
      miningDiagnosticStopped: false,
      presentationWorldMode: presentationWorldMode || null,
      presentationBaseline: presentationWorldMode ? presentationSnapshot(renderSystem, state) : null,
      rebase: null,
      legacyAdapterInstalled: false,
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
        stabilizeAuthoredPose(entity);
        entity.flags.boosting = transparentHeavy || combat;
        entity.data.intent = transparentHeavy || combat ? { thrust: 1, turn: 0, boost: true } : null;
        if (combat) {
          entity.hull = Math.max(1, entity.hullMax * (0.45 + (index % 4) * 0.1));
          entity.shield = Math.max(0, entity.shieldMax * (0.2 + (index % 3) * 0.2));
          entity.lastDamageT = state.simTime;
        }
        snapshot.injectedIds.push(entity.id);
        snapshot.liveInjectedIds.push(entity.id);
      }
    };

    const stabilizeAuthoredPose = (entity) => {
      entity.vel?.set?.(0, 0, 0);
      entity.prevPos?.copy?.(entity.pos);
      entity.prevRot = entity.rot;
      entity.prevBank = entity.bank;
      entity.prevPitch = entity.pitch;
      return entity;
    };

    if (id === 'mining_tether_active') {
      const vfxSystem = sf.registry?.get?.('vfx');
      if (vfxSystem?._miningBeam?.active) {
        throw new Error('mining_tether_active requires an inactive mining VFX baseline');
      }
      const asteroid = state.entityList.find((entity) => (
        entity?.alive !== false && entity?.type === 'asteroid'
      ));
      if (!asteroid) throw new Error('mining_tether_active requires a live asteroid');
      // Diagnostic stress only: bus events, not the player mining/tether input path. This arm is
      // journaled here—not in route navigation—so the scenario restorer owns its exact stop edge.
      sf.bus.emit('mining:start', { targetId: asteroid.id });
      sf.bus.emit('mining:tick', {
        targetId: asteroid.id,
        oreId: asteroid.data?.typeId || 'ast_metallic',
      });
      snapshot.miningDiagnosticArmed = true;
      snapshot.miningDiagnosticTargetId = asteroid.id;
    } else if (presentationWorldMode === 'legacy-current') {
      const baseline = snapshot.presentationBaseline;
      if (!(baseline.bound > 0) || baseline.active !== baseline.bound || baseline.meshes !== baseline.bound) {
        throw new Error('legacy current requires a settled active=bound=meshes PresentationWorld baseline');
      }
      await installLegacyEntityViewAdapter(renderSystem, snapshot);
    } else if (presentationWorldMode === 'dense-5x') {
      const baseline = snapshot.presentationBaseline.bound;
      if (!Number.isInteger(baseline) || baseline < 1) throw new Error('dense 5x requires a positive PresentationWorld baseline');
      if (snapshot.presentationBaseline.active !== baseline || snapshot.presentationBaseline.meshes !== baseline) {
        throw new Error('dense 5x requires a settled active=bound=meshes PresentationWorld baseline');
      }
      snapshot.presentationSpawnCount = baseline * 4;
      snapshot.presentationTargetActive = baseline * 5;
      await spawnFleet(snapshot.presentationSpawnCount);
    } else if (presentationWorldMode === 'churn') {
      const baseline = snapshot.presentationBaseline.bound;
      if (!Number.isInteger(baseline) || baseline < 1) throw new Error('presentation churn requires a positive PresentationWorld baseline');
      if (snapshot.presentationBaseline.active !== baseline || snapshot.presentationBaseline.meshes !== baseline) {
        throw new Error('presentation churn requires a settled active=bound=meshes baseline');
      }
      snapshot.presentationSpawnCount = baseline;
      snapshot.presentationTargetActive = baseline * 2;
      await spawnFleet(snapshot.presentationSpawnCount);
    } else if (presentationWorldMode === 'rebase') {
      const { applyFrameOrigin } = await import('/src/core/coordinates.js');
      const before = snapshot.presentationBaseline.frameOrigin;
      renderSystem.syncEntityViews(1);
      const sampleBefore = stableVisibleSample(renderSystem, state);
      if (!sampleBefore.length) throw new Error('presentation rebase requires a stable visible entity sample');
      const next = { x: before.x + 4096, z: before.z - 4096 };
      const applied = applyFrameOrigin(state, next);
      if (!applied) throw new Error('presentation rebase did not advance frame-origin authority');
      snapshot.rebase = {
        applied,
        before,
        target: { x: next.x, z: next.z, seq: state.world.frameOriginSeq },
        sampleBefore,
        diagnosticsBefore: snapshot.presentationBaseline.diagnostics,
        publisherBefore: snapshot.presentationBaseline.publisher,
      };
    } else if (id.startsWith('fleet_full_render_')) await spawnFleet(fleetCount || Number(id.split('_').pop()));
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
      stateInjected: snapshot.injectedIds.length > 0
        || id.startsWith('station_')
        || snapshot.miningDiagnosticArmed
        || presentationWorldMode != null,
      injectedEntityCount: snapshot.injectedIds.length,
      injectedIds: [...snapshot.injectedIds],
      baselineEntityCount: snapshot.entityCount,
      resourceStartTime: snapshot.resourceStartTime,
      activity: snapshot.activityTimer != null,
      holdsMeasuredPose,
      physicsPoseSynchronized: snapshot.physicsPoseSynchronized === true,
      miningDiagnosticArmed: snapshot.miningDiagnosticArmed,
      miningDiagnosticTargetId: snapshot.miningDiagnosticTargetId ?? null,
      presentationWorld: presentationWorldMode ? {
        mode: presentationWorldMode,
        baseline: snapshot.presentationBaseline,
        spawnCount: snapshot.presentationSpawnCount || 0,
        targetActive: snapshot.presentationTargetActive || snapshot.presentationBaseline.active,
        shippedTimeScale: snapshot.timeScale,
        coverage: presentationWorldMode === 'dense-5x'
          ? { population: '5x', motion: 'static', culling: 'current-camera-mixed' }
          : { population: 'current', motion: 'static', culling: 'current-camera-mixed' },
        rebase: snapshot.rebase,
        legacyAdapter: snapshot.legacyAdapterInstalled ? {
          installed: true,
          identity: 'renderer.syncEntityViews@75238d15^',
          source: 'live-current-GameState-and-mesh-map',
          permanentSelector: false,
          samePopulationParity: snapshot.legacyParity,
        } : null,
      } : null,
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

    function presentationSnapshot(render, liveState) {
      const world = render?._presentationWorld;
      const diagnostics = world?.getDiagnostics?.() || world?.diagnostics || {};
      const publisher = render?._presentationPublisher?.getDiagnostics?.() || {};
      const origin = liveState?.world?.frameOrigin || {};
      return {
        active: Number(world?.activeCount) || 0,
        bound: Number(world?.boundCount) || 0,
        free: Number(world?.freeCount) || 0,
        capacity: Number(world?.capacity) || 0,
        highWater: Number(diagnostics.highWater) || 0,
        growths: Number(diagnostics.growths) || 0,
        meshes: Number(render?._meshes?.size) || 0,
        diagnostics: copyPresentationDiagnostics(diagnostics),
        publisher: copyPublisherDiagnostics(publisher),
        frameOrigin: {
          x: Number(origin.x) || 0,
          z: Number(origin.z) || 0,
          seq: Number(liveState?.world?.frameOriginSeq) || 0,
        },
      };
    }

    function copyPresentationDiagnostics(source) {
      const result = {};
      for (const key of [
        'capacity', 'active', 'bound', 'free', 'highWater', 'allocations', 'retirements',
        'rebuilds', 'growths', 'staleHandleRejects', 'duplicateIdRejects', 'spatialMoves',
        'chainGuardTrips', 'maxRadiusRecomputes',
      ]) result[key] = Number(source?.[key]) || 0;
      return result;
    }

    function copyPublisherDiagnostics(source) {
      const result = {};
      for (const key of [
        'appliedRecords', 'spawnRecords', 'destroyRecords', 'transformRecords', 'visualRecords',
        'idempotentFrames', 'fullRebuilds', 'fallbackRebuilds', 'rangeFailures', 'applyFailures',
      ]) result[key] = Number(source?.[key]) || 0;
      result.lastError = source?.lastError || null;
      return result;
    }

    function stableVisibleSample(render, liveState, requestedIds = null) {
      const ids = Array.isArray(requestedIds) ? new Set(requestedIds) : null;
      const records = [];
      for (const record of render?._entityFrame?.records || []) {
        if (!record || record.viewCulled === true || ids && !ids.has(record.id)) continue;
        const entity = liveState.entities.get(record.id);
        const mesh = render._meshes.get(record.id);
        if (!entity || !mesh) continue;
        records.push({
          id: record.id,
          root: mesh.uuid || null,
          world: { x: Number(entity.pos?.x) || 0, z: Number(entity.pos?.z) || 0 },
          local: { x: Number(mesh.position?.x) || 0, z: Number(mesh.position?.z) || 0 },
        });
      }
      records.sort((left, right) => left.id - right.id);
      return records.slice(0, 16);
    }

    async function installLegacyEntityViewAdapter(render, journal) {
      if (window.__SF_PRESENTATION_WORLD_LEGACY_ADAPTER__) {
        throw new Error('legacy entity-view adapter is already installed');
      }
      const [frameApi, lodApi, rendererApi, canopyApi, THREE] = await Promise.all([
        import('/src/render/renderEntityFrame.js'),
        import('/src/render/lod.js'),
        import('/src/render/renderer.js'),
        import('/src/render/canopyMaterialPolicy.js'),
        import('three'),
      ]);
      const original = render.syncEntityViews;
      if (typeof original !== 'function') throw new Error('current dense syncEntityViews authority is unavailable');
      const originalDescriptor = Object.getOwnPropertyDescriptor(render, 'syncEntityViews');
      const meshLocalXZ = { x: 0, z: 0 };
      const worldSiteA11y = { reducedMotion: false, reducedFlash: false };

      const configureLegacyShadowCasters = (root) => {
        canopyApi.configureRealtimeCanopyMaterials(root);
        root.traverse((object) => {
          if (!object.isMesh) return;
          if (!object.visible) { object.castShadow = false; object.receiveShadow = false; return; }
          if (object.userData?.spacefaceNoShadow) { object.castShadow = false; object.receiveShadow = false; return; }
          if (object.userData?.sharedContactShadow) { object.castShadow = false; return; }
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          const casts = materials.some((material) => material
            && !material.transparent
            && material.depthWrite !== false
            && (material.opacity == null || material.opacity >= 1)
            && material.blending === THREE.NormalBlending);
          object.castShadow = casts;
          object.receiveShadow = casts;
        });
      };

      const publishLegacyHlodDiagnostics = (owner) => {
        let hlodDetailedVisible = 0;
        let hlodProxyVisible = 0;
        let hlodObjectsSwapped = 0;
        for (const mesh of owner._meshes.values()) {
          const hlod = mesh.userData && mesh.userData.hlod;
          if (!hlod) continue;
          hlodDetailedVisible += Number(hlod.detailedVisible) || 0;
          hlodProxyVisible += Number(hlod.proxyVisible) || 0;
          if (hlod.swapped) hlodObjectsSwapped++;
        }
        owner.state.render.hlod = { hlodDetailedVisible, hlodProxyVisible, hlodObjectsSwapped };
      };

      // Exact pre-PresentationWorld broad entity-view algorithm, transplanted only into this page
      // realm. It reads the current candidate's live GameState and mesh map, records through the
      // existing entityViewSync renderWork timer, and is never selectable by product code.
      let adapter = null;
      const restoreAdapterAuthority = () => {
        if (originalDescriptor) Object.defineProperty(render, 'syncEntityViews', originalDescriptor);
        else delete render.syncEntityViews;
        return render.syncEntityViews === original
          && (originalDescriptor != null || !Object.hasOwn(render, 'syncEntityViews'));
      };
      const captureVisibleSemantics = (owner) => {
        const rounded = (value) => Number.isFinite(value) ? Math.round(value * 100_000) / 100_000 : null;
        const records = owner._entityFrame.records
          .filter((record) => record && record.viewCulled !== true)
          .map((record) => {
            const mesh = record.mesh;
            const userData = mesh?.userData || {};
            const hlod = userData.hlod;
            return {
              id: String(record.id),
              root: mesh?.uuid || null,
              radius: rounded(record.entity?.radius),
              visible: record.visible === true,
              viewCulled: record.viewCulled === true,
              renderOrder: Number(mesh?.renderOrder) || 0,
              pose: {
                x: rounded(record.x), y: rounded(record.y), z: rounded(record.z),
                rx: rounded(record.rx), ry: rounded(record.ry), rz: rounded(record.rz),
                sx: rounded(record.sx), sy: rounded(record.sy), sz: rounded(record.sz),
              },
              lodLevel: record.lodLevel || null,
              categories: {
                contactShadow: record.contactShadow === true,
                shipAuxiliary: record.shipAuxiliary === true,
                authored: record.authored === true,
                asteroidInstance: record.asteroidInstance === true,
              },
              closures: {
                shieldVisible: userData.shieldBubble?.visible === true,
                shieldRoot: userData.shieldBubble?.uuid || null,
                hullRoot: userData.hull?.uuid || null,
                authoredAssetState: userData.authoredAssetState || null,
                hlodDetailedVisible: Number(hlod?.detailedVisible) || 0,
                hlodProxyVisible: Number(hlod?.proxyVisible) || 0,
                hlodSwapped: hlod?.swapped === true,
              },
              descendants: descendantSemantics(mesh, rounded),
            };
          });
        const camera = owner.cam?.obj;
        return {
          records,
          logicalPools: {
            contactShadows: owner._entityFrame.contactShadows.map((record) => String(record.id)),
            shipAuxiliary: owner._entityFrame.shipAux.map((record) => String(record.id)),
            authored: owner._entityFrame.authored.map((record) => String(record.id)),
            asteroidInstances: owner._entityFrame.asteroids.map((record) => String(record.id)),
          },
          camera: camera ? {
            x: rounded(camera.position?.x),
            y: rounded(camera.position?.y),
            z: rounded(camera.position?.z),
            qx: rounded(camera.quaternion?.x),
            qy: rounded(camera.quaternion?.y),
            qz: rounded(camera.quaternion?.z),
            qw: rounded(camera.quaternion?.w),
            fov: rounded(camera.fov),
            aspect: rounded(camera.aspect),
          } : null,
        };
      };
      const descendantSemantics = (root, rounded) => {
        const descendants = [];
        root?.traverse?.((object) => {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          descendants.push({
            uuid: object.uuid || null,
            parent: object.parent?.uuid || null,
            name: object.name || '',
            mesh: object.isMesh === true,
            visible: object.visible !== false,
            renderOrder: Number(object.renderOrder) || 0,
            geometry: object.geometry?.uuid || null,
            materials: materials.filter(Boolean).map((material) => material.uuid || null),
            position: {
              x: rounded(object.position?.x),
              y: rounded(object.position?.y),
              z: rounded(object.position?.z),
            },
          });
        });
        return descendants;
      };
      const recoverDenseAuthority = (owner, alpha, error) => {
        if (owner.state?.render) {
          owner.state.render.entityViewSync = error.retainedEntityViewSync;
          owner.state.render.hlod = error.retainedHlod;
        }
        const restoredAuthority = restoreAdapterAuthority();
        owner._presentationQueries?.reset?.();
        frameApi.beginRenderEntityFrame(owner._entityFrame);
        frameApi.endRenderEntityFrame(owner._entityFrame);
        if (adapter) {
          adapter.failed = true;
          adapter.restoredOnFailure = restoredAuthority;
          adapter.failureMessage = error?.message || String(error);
        }
        if (window.__SF_PRESENTATION_WORLD_LEGACY_ADAPTER__ === adapter) {
          delete window.__SF_PRESENTATION_WORLD_LEGACY_ADAPTER__;
        }
        try {
          original.call(owner, alpha);
          if (adapter) adapter.denseFallbackSucceeded = true;
        } catch (fallbackError) {
          error.fallbackError = fallbackError?.message || String(fallbackError);
        }
        journal.legacyAdapterRestoredOnFailure = restoredAuthority
          && adapter?.denseFallbackSucceeded === true;
        journal.legacyAdapterFailure = {
          message: error?.message || String(error),
          descriptorRestored: restoredAuthority,
          denseFallbackSucceeded: adapter?.denseFallbackSucceeded === true,
          queryReset: true,
          frameReset: true,
        };
        return restoredAuthority;
      };
      const legacySyncEntityViews = function legacyCurrentSyncEntityViews(alpha) {
        const retainedEntityViewSync = this.state?.render?.entityViewSync;
        const retainedHlod = this.state?.render?.hlod;
        try {
          if (adapter?.injectFailureOnce === true) {
            adapter.injectFailureOnce = false;
            throw new Error('injected legacy entity-view adapter failure');
          }
          const useCpu = !!(this.state && this.state.perfRuntime
            && this.state.perfRuntime.renderWorkEnabled
            && typeof this.state.perfRuntime.recordRenderWork === 'function');
          const started = useCpu && typeof performance !== 'undefined' ? performance.now() : 0;
          const now = typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
          const settings = this.state.settings || {};
          worldSiteA11y.reducedMotion = !!(settings.video && settings.video.motionReduce);
          worldSiteA11y.reducedFlash = !!(settings.accessibility && settings.accessibility.flashReduce);
          const bounds = this._entityViewCullBounds();
          let totalMeshes = 0;
          let transformed = 0;
          let fullSynced = 0;
          let culled = 0;
          let lodChecked = 0;
          const membrane = this._frameMembrane;
          frameApi.beginRenderEntityFrame(this._entityFrame);
          for (const [entityId, mesh] of this._meshes) {
          totalMeshes++;
          const entity = this.state.entities.get(entityId);
          if (!entity || entity.alive === false || !mesh) continue;
          if (this.collisionDebug?.on) mesh.userData.__lastEntity = entity;
          const viewCulled = this._isEntityViewCulled(entity, bounds, mesh);
          if (mesh.userData?.asteroidInstanceBody) mesh.userData.asteroidInstanceViewCulled = viewCulled;
          if (viewCulled) culled++;
          const hull = mesh.userData && mesh.userData.hull;
          if (entity.flags.noInterp) {
            const local = membrane.toLocal(entity.pos, meshLocalXZ);
            mesh.position.set(local.x, 0, local.z);
            mesh.rotation.y = -entity.rot;
            if (hull && entity.bank != null) hull.rotation.x = entity.bank;
            if (hull && entity.pitch != null) hull.rotation.z = entity.pitch;
          } else {
            const local = membrane.interpolateLocal(entity.prevPos, entity.pos, alpha, meshLocalXZ);
            mesh.position.x = local.x;
            mesh.position.z = local.z;
            mesh.position.y = 0;
            let deltaRotation = entity.rot - entity.prevRot;
            deltaRotation = ((deltaRotation + Math.PI) % (Math.PI * 2)) - Math.PI;
            if (deltaRotation < -Math.PI) deltaRotation += Math.PI * 2;
            mesh.rotation.y = -(entity.prevRot + deltaRotation * alpha);
            if (hull && entity.bank != null) {
              const previousBank = entity.prevBank || 0;
              hull.rotation.x = previousBank + (entity.bank - previousBank) * alpha;
            }
            if (hull && entity.pitch != null) {
              const previousPitch = entity.prevPitch || 0;
              hull.rotation.z = previousPitch + (entity.pitch - previousPitch) * alpha;
            }
          }
          transformed++;
          if (mesh.userData.lod && mesh.userData.updateLod) {
            lodChecked++;
            const visualRadius = mesh.userData.hlod && Number(mesh.userData.hlod.visualRadius);
            const radius = Number.isFinite(visualRadius) && visualRadius > 0 ? visualRadius : entity.radius;
            const projected = lodApi.projectedWidthPx(mesh.position, radius, this.cam.obj, this.viewport);
            const level = entity.id === this.state.playerId ? 'lod0' : mesh.userData.lod.resolve(projected);
            mesh.userData.updateLod(level);
            if (mesh.userData.hlod) configureLegacyShadowCasters(mesh);
          }
          frameApi.classifyRenderEntity(this._entityFrame, entity, mesh, viewCulled);
          if (viewCulled) continue;
          fullSynced++;
          if (mesh.userData.updateRuntimeState) mesh.userData.updateRuntimeState(entity, now);
          if (entity.id === this.state.playerId && this._livingHullPresentation) {
            this._livingHullPresentation.sync(
              entity.data && entity.data.livingHull,
              this.state.simTime,
              entity,
            );
          }
          if (mesh.userData.updateWorldSitePresentation) {
            mesh.userData.updateWorldSitePresentation(entity, this.state.simTime, worldSiteA11y);
          }
          if (mesh.userData.updateDamageState) mesh.userData.updateDamageState(entity, now);
          if (mesh.userData.updateDriveState) mesh.userData.updateDriveState(entity, now);
          const shieldBubble = mesh.userData.shieldBubble;
          if (shieldBubble) {
            const up = entity.shield > 0;
            let flash = 0;
            if (up) {
              const uniforms = shieldBubble.material.uniforms;
              const priorShield = shieldBubble.userData._prevShield != null
                ? shieldBubble.userData._prevShield : entity.shield;
              if (entity.shield < priorShield - 0.5) {
                uniforms.uFlash.value = Math.min(1, uniforms.uFlash.value + 0.8);
              }
              shieldBubble.userData._prevShield = entity.shield;
              const priorTime = shieldBubble.userData._prevFlashT != null
                ? shieldBubble.userData._prevFlashT : now;
              const dt = Math.min(0.1, now - priorTime);
              shieldBubble.userData._prevFlashT = now;
              uniforms.uFlash.value *= Math.pow(0.05, dt);
              flash = uniforms.uFlash.value;
            }
            const visible = rendererApi.shouldPresentShieldBubble(entity.shield, flash);
            if (shieldBubble.visible !== visible) shieldBubble.visible = visible;
          }
          }
          frameApi.endRenderEntityFrame(this._entityFrame);
          this.state.render.entityViewSync = {
            totalMeshes,
            transformed,
            fullSynced,
            culled,
            lodChecked,
            cullHalfX: Math.round(bounds.halfX),
            cullHalfZ: Math.round(bounds.halfZ),
          };
          const frameDiagnostics = this.state.render.entityFrame || (this.state.render.entityFrame = {});
          frameDiagnostics.frameId = this._entityFrame.frameId;
          frameDiagnostics.traversals = this._entityFrame.traversals;
          frameDiagnostics.entitiesVisited = this._entityFrame.entitiesVisited;
          frameDiagnostics.contactShadows = this._entityFrame.contactShadows.length;
          frameDiagnostics.shipAux = this._entityFrame.shipAux.length;
          frameDiagnostics.authored = this._entityFrame.authored.length;
          frameDiagnostics.asteroids = this._entityFrame.asteroids.length;
          if (useCpu && started) this.state.perfRuntime.recordRenderWork('entityViewSync', performance.now() - started);
          publishLegacyHlodDiagnostics(this);
        } catch (error) {
          error.retainedEntityViewSync = retainedEntityViewSync;
          error.retainedHlod = retainedHlod;
          recoverDenseAuthority(this, alpha, error);
          throw error;
        }
      };

      adapter = {
        render,
        original,
        originalDescriptor,
        installed: legacySyncEntityViews,
        restore: restoreAdapterAuthority,
        failed: false,
        restoredOnFailure: false,
        denseFallbackSucceeded: false,
        injectFailureOnce: false,
      };
      journal.legacyAdapterOriginal = original;
      journal.legacyAdapterOriginalDescriptor = originalDescriptor;
      try {
        original.call(render, 1);
        const denseSemantics = captureVisibleSemantics(render);
        render.syncEntityViews = legacySyncEntityViews;
        if (render.syncEntityViews !== legacySyncEntityViews) throw new Error('legacy adapter installation did not stick');
        window.__SF_PRESENTATION_WORLD_LEGACY_ADAPTER__ = adapter;
        journal.legacyAdapterInstalled = true;
        legacySyncEntityViews.call(render, 1);
        const legacySemantics = captureVisibleSemantics(render);
        journal.legacyParity = {
          pass: JSON.stringify(denseSemantics) === JSON.stringify(legacySemantics),
          poseAlpha: 1,
          population: journal.presentationBaseline.bound,
          dense: denseSemantics,
          legacy: legacySemantics,
        };
        if (!journal.legacyParity.pass) {
          throw new Error('legacy same-population visible semantic parity mismatch');
        }
      } catch (error) {
        if (render.syncEntityViews === legacySyncEntityViews) {
          error.retainedEntityViewSync = render.state?.render?.entityViewSync;
          error.retainedHlod = render.state?.render?.hlod;
          recoverDenseAuthority(render, 1, error);
        } else {
          restoreAdapterAuthority();
          delete window.__SF_PRESENTATION_WORLD_LEGACY_ADAPTER__;
        }
        throw error;
      }
    }
  }, {
    id: scenarioId,
    fleetCount: definition.fleetCount || 0,
    scenarioSeed: seed,
    holdsMeasuredPose,
    presentationWorldMode: definition.presentationWorldMode || null,
  });

  let readiness = null;
  if (definition.actualRenderedEntitiesRequired
      || definition.presentationWorldReadyRequired
      || definition.presentationWorldMode) {
    readiness = await waitForPerformanceScenarioReady(page, scenarioId);
  }
  let churn = null;
  if (definition.presentationWorldMode === 'churn') {
    churn = await advancePresentationWorldChurn(page, scenarioId, seed);
    readiness = await waitForPerformanceScenarioReady(page, scenarioId);
    churn = { ...churn, settlement: await capturePresentationWorldChurnSettlement(page, scenarioId) };
  }
  log(`[scenario] prepared ${scenarioId} injected=${receipt.injectedEntityCount}`);
  return { ...receipt, baselineSettle, readiness, churn, definition };
}

async function waitForPresentationWorldBaseline(page, scenarioId, { timeoutMs = 120_000 } = {}) {
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf?.state;
    const render = sf?.registry?.get?.('render');
    const world = render?._presentationWorld;
    if (!state || state.timeScale !== 1 || !world || !render?._meshes || !(world.activeCount > 0)) return false;
    const queueRemaining = Array.isArray(render._meshBuildQueue)
      ? Math.max(0, render._meshBuildQueue.length - (render._meshBuildQueueHead || 0))
      : 0;
    const upgrades = state.render?.scene?.userData?.authoredUpgradeDiagnostics;
    return world.activeCount === world.boundCount
      && world.boundCount === render._meshes.size
      && queueRemaining === 0
      && render._meshReconcileDirty !== true
      && Number(upgrades?.activeJobs || 0) === 0;
  }, null, { timeout: timeoutMs });
  return page.evaluate((expectedId) => {
    const sf = window.SF;
    const state = sf?.state;
    const render = sf?.registry?.get?.('render');
    const world = render?._presentationWorld;
    return {
      scenarioId: expectedId,
      settled: true,
      active: world?.activeCount ?? null,
      bound: world?.boundCount ?? null,
      meshes: render?._meshes?.size ?? null,
      timeScale: state?.timeScale ?? null,
    };
  }, scenarioId);
}

export async function waitForPerformanceScenarioReady(page, scenarioId, { timeoutMs = 120_000 } = {}) {
  await page.waitForFunction((expectedId) => {
    const sf = window.SF;
    const state = sf?.state;
    const snapshot = window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    if (!state || snapshot?.id !== expectedId) return false;
    const shipIds = snapshot.liveInjectedIds.filter((id) => state.entities.get(id)?.type === 'ship');
    if (!['legacy-current', 'rebase'].includes(snapshot.presentationWorldMode) && !shipIds.length) return false;
    for (const id of shipIds) {
      const entity = state.entities.get(id);
      if (!entity?.mesh) return false;
      if (entity.mesh.userData?.authoredAssetState !== 'authored') return false;
    }
    const renderSystem = sf.registry?.get?.('render');
    const world = renderSystem?._presentationWorld;
    if (snapshot.presentationWorldMode) {
      if (!world) return false;
      if (snapshot.presentationWorldMode === 'rebase') {
        if (renderSystem?._frameMembrane?.seq !== state.world?.frameOriginSeq) return false;
      } else {
        const targetActive = snapshot.presentationTargetActive || snapshot.presentationBaseline.active;
        if (world.activeCount !== targetActive) return false;
        if (world.boundCount !== targetActive) return false;
        if (renderSystem._meshes.size !== targetActive) return false;
        for (const id of shipIds) {
          const slot = world.getSlotForEntityId(id);
          if (slot < 0 || world.meshRefs[slot] !== state.entities.get(id)?.mesh) return false;
        }
        for (const id of snapshot.retiredInjectedIds) {
          if (world.getSlotForEntityId(id) >= 0) return false;
        }
      }
    }
    const queueRemaining = Array.isArray(renderSystem?._meshBuildQueue)
      ? Math.max(0, renderSystem._meshBuildQueue.length - (renderSystem._meshBuildQueueHead || 0))
      : 0;
    const upgrades = state.render?.scene?.userData?.authoredUpgradeDiagnostics;
    return queueRemaining === 0 && renderSystem?._meshReconcileDirty !== true && Number(upgrades?.activeJobs || 0) === 0;
  }, scenarioId, { timeout: timeoutMs });
  return page.evaluate((expectedId) => {
    const state = window.SF?.state;
    const snapshot = window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    const renderSystem = window.SF?.registry?.get?.('render');
    const world = renderSystem?._presentationWorld;
    const entities = snapshot?.liveInjectedIds.map((id) => state.entities.get(id)).filter(Boolean) || [];
    const diagnostics = world?.getDiagnostics?.() || {};
    const publisher = renderSystem?._presentationPublisher?.getDiagnostics?.() || {};
    const rebaseAfter = snapshot?.rebase ? {
      sample: snapshot.rebase.sampleBefore.map((before) => {
        const entity = state.entities.get(before.id);
        const mesh = renderSystem?._meshes?.get?.(before.id);
        return {
          id: before.id,
          root: mesh?.uuid || null,
          world: entity ? { x: Number(entity.pos?.x) || 0, z: Number(entity.pos?.z) || 0 } : null,
          local: mesh ? { x: Number(mesh.position?.x) || 0, z: Number(mesh.position?.z) || 0 } : null,
        };
      }),
      diagnostics: copyDiagnostics(diagnostics),
      publisher: copyPublisher(publisher),
    } : null;
    if (snapshot?.presentationWorldMode) {
      snapshot.presentationReady = {
        diagnostics: copyDiagnostics(diagnostics),
        publisher: copyPublisher(publisher),
      };
    }
    return {
      scenarioId: expectedId,
      injectedAlive: entities.filter((entity) => entity.alive !== false).length,
      renderedShips: entities.filter((entity) => entity.type === 'ship' && entity.mesh).length,
      authoredShips: entities.filter((entity) => entity.type === 'ship' && entity.mesh?.userData?.authoredAssetState === 'authored').length,
      presentationWorld: snapshot?.presentationWorldMode ? {
        active: world?.activeCount ?? null,
        bound: world?.boundCount ?? null,
        meshes: renderSystem?._meshes?.size ?? null,
        targetActive: snapshot.presentationTargetActive || snapshot.presentationBaseline.active,
        baseline: snapshot.presentationBaseline,
        retiredAbsent: snapshot.retiredInjectedIds.every((id) => world?.getSlotForEntityId?.(id) < 0),
        frameOriginSeq: state?.world?.frameOriginSeq ?? null,
        membraneSeq: renderSystem?._frameMembrane?.seq ?? null,
        shippedTimeScale: snapshot.timeScale,
        timeScale: state?.timeScale ?? null,
        timeScalePreserved: state?.timeScale === snapshot.timeScale,
        diagnostics: copyDiagnostics(diagnostics),
        publisher: copyPublisher(publisher),
        rebase: rebaseAfter,
      } : null,
    };

    function copyDiagnostics(source) {
      const result = {};
      for (const key of [
        'capacity', 'active', 'bound', 'free', 'highWater', 'allocations', 'retirements',
        'rebuilds', 'growths', 'staleHandleRejects', 'duplicateIdRejects', 'spatialMoves',
        'chainGuardTrips', 'maxRadiusRecomputes',
      ]) result[key] = Number(source?.[key]) || 0;
      return result;
    }

    function copyPublisher(source) {
      const result = {};
      for (const key of [
        'appliedRecords', 'spawnRecords', 'destroyRecords', 'transformRecords', 'visualRecords',
        'idempotentFrames', 'fullRebuilds', 'fallbackRebuilds', 'rangeFailures', 'applyFailures',
      ]) result[key] = Number(source?.[key]) || 0;
      result.lastError = source?.lastError || null;
      return result;
    }
  }, scenarioId);
}

async function advancePresentationWorldChurn(page, scenarioId, seed) {
  return page.evaluate(async ({ expectedId, scenarioSeed }) => {
    const sf = window.SF;
    const state = sf?.state;
    const snapshot = window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    if (!state || snapshot?.id !== expectedId || snapshot.presentationWorldMode !== 'churn') {
      throw new Error('presentation churn requires its active scenario journal');
    }
    const render = sf.registry?.get?.('render');
    const world = render?._presentationWorld;
    if (!world) throw new Error('presentation churn requires its live PresentationWorld');
    const { makeShipEntitySpec } = await import('/src/systems/ships.js');
    const retiring = snapshot.liveInjectedIds.slice(0, Math.max(1, Math.floor(snapshot.liveInjectedIds.length / 2)));
    const retiringHandles = retiring.map((id) => world.handleForEntityId(id)).filter(Boolean);
    snapshot.churn = {
      retiringHandles,
      retiringRoots: retiring.map((id) => render._meshes.get(id)).filter(Boolean),
      diagnosticsBefore: copyDiagnostics(world.getDiagnostics()),
      publisherBefore: copyPublisher(render._presentationPublisher?.getDiagnostics?.() || {}),
    };
    for (const id of retiring) {
      sf.helpers.removeEntity(id);
      snapshot.retiredInjectedIds.push(id);
    }
    snapshot.liveInjectedIds = snapshot.liveInjectedIds.filter((id) => !retiring.includes(id));
    const replacements = [];
    for (let index = 0; index < retiring.length; index++) {
      const phase = (((scenarioSeed + 131) % 997) + 997) % 997 / 997 * Math.PI * 2;
      const angle = phase + (Math.PI * 2 * index / Math.max(1, retiring.length));
      const radius = 110 + (index % 12) * 24;
      const spec = makeShipEntitySpec('ship_kestrel', {
        team: 2,
        factionId: 'faction_scn',
        pos: {
          x: state.entities.get(state.playerId).pos.x + Math.cos(angle) * radius,
          z: state.entities.get(state.playerId).pos.z + Math.sin(angle) * radius,
        },
        rot: angle + Math.PI,
        ai: null,
      });
      spec.collides = false;
      spec.collisionMask = 0;
      spec.data.perfScenario = { id: expectedId, index, diagnostic: true, churnReplacement: true };
      const entity = sf.helpers.spawnEntity(spec);
      entity.vel?.set?.(0, 0, 0);
      entity.prevPos?.copy?.(entity.pos);
      entity.prevRot = entity.rot;
      entity.prevBank = entity.bank;
      entity.prevPitch = entity.pitch;
      snapshot.injectedIds.push(entity.id);
      snapshot.liveInjectedIds.push(entity.id);
      replacements.push(entity.id);
    }
    return {
      retiredIds: retiring,
      replacementIds: replacements,
      churnCount: retiring.length,
      liveCount: snapshot.liveInjectedIds.length,
      targetActive: snapshot.presentationTargetActive,
      retiringHandles,
      diagnosticsBefore: snapshot.churn.diagnosticsBefore,
      publisherBefore: snapshot.churn.publisherBefore,
    };

    function copyDiagnostics(source) {
      const result = {};
      for (const key of [
        'capacity', 'active', 'bound', 'free', 'highWater', 'allocations', 'retirements',
        'rebuilds', 'growths', 'staleHandleRejects', 'duplicateIdRejects', 'spatialMoves',
        'chainGuardTrips', 'maxRadiusRecomputes',
      ]) result[key] = Number(source?.[key]) || 0;
      return result;
    }

    function copyPublisher(source) {
      const result = {};
      for (const key of [
        'appliedRecords', 'spawnRecords', 'destroyRecords', 'transformRecords', 'visualRecords',
        'idempotentFrames', 'fullRebuilds', 'fallbackRebuilds', 'rangeFailures', 'applyFailures',
      ]) result[key] = Number(source?.[key]) || 0;
      result.lastError = source?.lastError || null;
      return result;
    }
  }, { expectedId: scenarioId, scenarioSeed: seed });
}

async function capturePresentationWorldChurnSettlement(page, scenarioId) {
  return page.evaluate((expectedId) => {
    const sf = window.SF;
    const state = sf?.state;
    const snapshot = window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    const render = sf?.registry?.get?.('render');
    const world = render?._presentationWorld;
    if (!state || snapshot?.id !== expectedId || !snapshot.churn || !world) {
      throw new Error('presentation churn settlement requires its live journal');
    }
    const diagnosticsAfter = copyDiagnostics(world.getDiagnostics());
    const publisherAfter = copyPublisher(render._presentationPublisher?.getDiagnostics?.() || {});
    const priorBySlot = new Map(snapshot.churn.retiringHandles.map((handle) => [handle.slot, handle]));
    const replacementHandles = snapshot.liveInjectedIds
      .filter((id) => state.entities.get(id)?.data?.perfScenario?.churnReplacement === true)
      .map((id) => world.handleForEntityId(id))
      .filter(Boolean);
    const generationsAdvanced = replacementHandles.length === snapshot.churn.retiringHandles.length
      && replacementHandles.every((handle) => {
        const prior = priorBySlot.get(handle.slot);
        return prior && handle.generation > prior.generation;
      });
    const retiredAbsence = snapshot.retiredInjectedIds.map((id) => ({
      id,
      world: world.getSlotForEntityId(id) < 0,
      mesh: !render._meshes.has(id),
      frame: !render._entityFrame?.byId?.has?.(id),
      contactShadowPool: !render._contactShadowPool?.records?.has?.(id),
      asteroidPool: !render._asteroidInstancePool?.byEntity?.has?.(id),
    }));
    const retiredRootsDetached = snapshot.churn.retiringRoots.every((root) => !root?.parent);
    const count = snapshot.churn.retiringHandles.length;
    const counterDeltas = {
      allocations: diagnosticsAfter.allocations - snapshot.churn.diagnosticsBefore.allocations,
      retirements: diagnosticsAfter.retirements - snapshot.churn.diagnosticsBefore.retirements,
      rebuilds: diagnosticsAfter.rebuilds - snapshot.churn.diagnosticsBefore.rebuilds,
      growths: diagnosticsAfter.growths - snapshot.churn.diagnosticsBefore.growths,
      spatialMoves: diagnosticsAfter.spatialMoves - snapshot.churn.diagnosticsBefore.spatialMoves,
      staleHandleRejects: diagnosticsAfter.staleHandleRejects - snapshot.churn.diagnosticsBefore.staleHandleRejects,
      duplicateIdRejects: diagnosticsAfter.duplicateIdRejects - snapshot.churn.diagnosticsBefore.duplicateIdRejects,
      chainGuardTrips: diagnosticsAfter.chainGuardTrips - snapshot.churn.diagnosticsBefore.chainGuardTrips,
    };
    const publisherDeltas = {
      fullRebuilds: publisherAfter.fullRebuilds - snapshot.churn.publisherBefore.fullRebuilds,
      fallbackRebuilds: publisherAfter.fallbackRebuilds - snapshot.churn.publisherBefore.fallbackRebuilds,
      rangeFailures: publisherAfter.rangeFailures - snapshot.churn.publisherBefore.rangeFailures,
      applyFailures: publisherAfter.applyFailures - snapshot.churn.publisherBefore.applyFailures,
    };
    return {
      diagnosticsBefore: snapshot.churn.diagnosticsBefore,
      diagnosticsAfter,
      publisherBefore: snapshot.churn.publisherBefore,
      publisherAfter,
      counterDeltas,
      publisherDeltas,
      replacementHandles,
      generationsAdvanced,
      retiredAbsence,
      retiredRootsDetached,
      meshes: render._meshes.size,
      exactCycle: counterDeltas.allocations === count
        && counterDeltas.retirements === count
        && counterDeltas.spatialMoves === count,
      capacityStable: diagnosticsAfter.capacity === snapshot.churn.diagnosticsBefore.capacity,
      highWaterStable: diagnosticsAfter.highWater === snapshot.churn.diagnosticsBefore.highWater,
      noUnexpectedWorldMutation: counterDeltas.rebuilds === 0
        && counterDeltas.growths === 0
        && counterDeltas.spatialMoves === count
        && counterDeltas.staleHandleRejects === 0
        && counterDeltas.duplicateIdRejects === 0
        && counterDeltas.chainGuardTrips === 0,
      noPublisherFailure: publisherDeltas.fullRebuilds === 0
        && publisherDeltas.fallbackRebuilds === 0
        && publisherDeltas.rangeFailures === 0
        && publisherDeltas.applyFailures === 0
        && publisherAfter.lastError === snapshot.churn.publisherBefore.lastError,
    };

    function copyDiagnostics(source) {
      const result = {};
      for (const key of [
        'capacity', 'active', 'bound', 'free', 'highWater', 'allocations', 'retirements',
        'rebuilds', 'growths', 'staleHandleRejects', 'duplicateIdRejects', 'spatialMoves',
        'chainGuardTrips', 'maxRadiusRecomputes',
      ]) result[key] = Number(source?.[key]) || 0;
      return result;
    }

    function copyPublisher(source) {
      const result = {};
      for (const key of [
        'appliedRecords', 'spawnRecords', 'destroyRecords', 'transformRecords', 'visualRecords',
        'idempotentFrames', 'fullRebuilds', 'fallbackRebuilds', 'rangeFailures', 'applyFailures',
      ]) result[key] = Number(source?.[key]) || 0;
      result.lastError = source?.lastError || null;
      return result;
    }
  }, scenarioId);
}

export async function restorePerformanceScenario(page, scenarioId, { log = () => {} } = {}) {
  const removal = await page.evaluate(async (expectedId) => {
    const sf = window.SF;
    const state = sf?.state;
    const snapshot = window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    const renderSystem = sf?.registry?.get?.('render');
    if (!snapshot) return { scenarioId: expectedId, restored: true, reason: 'nothing-to-restore', injectedIds: [] };
    if (snapshot.id !== expectedId) throw new Error(`scenario restore mismatch: expected ${expectedId}, found ${snapshot.id}`);
    let legacyAdapterRestored = snapshot.presentationWorldMode !== 'legacy-current';
    if (snapshot.presentationWorldMode === 'legacy-current') {
      const adapter = window.__SF_PRESENTATION_WORLD_LEGACY_ADAPTER__;
      if (adapter?.render && adapter.render.syncEntityViews === adapter.installed) {
        legacyAdapterRestored = adapter.restore?.() === true;
      } else if (adapter?.render?.syncEntityViews === adapter?.original && adapter?.restoredOnFailure === true) {
        legacyAdapterRestored = true;
      } else if (snapshot.legacyAdapterRestoredOnFailure === true
          && renderSystem?.syncEntityViews === snapshot.legacyAdapterOriginal) {
        legacyAdapterRestored = true;
      } else if (snapshot.legacyAdapterRestored === true
          && renderSystem?.syncEntityViews === snapshot.legacyAdapterOriginal) {
        legacyAdapterRestored = true;
      }
      if (legacyAdapterRestored) delete window.__SF_PRESENTATION_WORLD_LEGACY_ADAPTER__;
    }
    let rebaseRestoreRequested = false;
    if (snapshot.rebase?.applied) {
      const { applyFrameOrigin } = await import('/src/core/coordinates.js');
      rebaseRestoreRequested = applyFrameOrigin(state, snapshot.rebase.before);
    }
    if (snapshot.activityTimer != null) clearInterval(snapshot.activityTimer);
    snapshot.activityTimer = null;
    if (snapshot.miningDiagnosticArmed) {
      sf.bus.emit('mining:stop', {
        minerId: state.playerId,
        targetId: snapshot.miningDiagnosticTargetId,
        diagnostic: true,
      });
      snapshot.miningDiagnosticStopped = true;
    }
    for (const id of snapshot.injectedIds) {
      if (state.entities.has(id)) sf.helpers.removeEntity(id);
    }
    snapshot.restoreRequested = true;
    snapshot.legacyAdapterRestored = legacyAdapterRestored;
    snapshot.rebaseRestoreRequested = rebaseRestoreRequested;
    return {
      scenarioId: expectedId,
      injectedIds: [...snapshot.injectedIds],
      restoreRequested: true,
      presentationBaseline: snapshot.presentationBaseline,
      legacyAdapterRestored,
      rebaseRestoreRequested,
    };
  }, scenarioId);

  if (removal.injectedIds?.length || removal.presentationBaseline) {
    await page.waitForFunction(({ ids, baseline }) => {
      const sf = window.SF;
      const state = sf?.state;
      const render = sf?.registry?.get?.('render');
      const world = render?._presentationWorld;
      if (!ids.every((id) => !state?.entities?.has?.(id)
        && !render?._meshes?.has?.(id)
        && (!world || world.getSlotForEntityId(id) < 0))) return false;
      if (!baseline) return true;
      return world?.activeCount === baseline.active
        && world?.boundCount === baseline.bound
        && render?._meshes?.size === baseline.meshes
        && state?.world?.frameOrigin?.x === baseline.frameOrigin.x
        && state?.world?.frameOrigin?.z === baseline.frameOrigin.z
        && render?._frameMembrane?.seq === state?.world?.frameOriginSeq;
    }, { ids: removal.injectedIds || [], baseline: removal.presentationBaseline || null }, { timeout: 30_000 });
  }
  const receipt = await page.evaluate((expectedId) => {
    const sf = window.SF;
    const state = sf?.state;
    const snapshot = window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
    if (!snapshot) return { scenarioId: expectedId, restored: true, reason: 'nothing-to-restore' };
    const player = state?.entities?.get?.(state.playerId);
    const vfxSystem = sf.registry?.get?.('vfx');
    const renderSystem = sf.registry?.get?.('render');
    const presentationWorld = renderSystem?._presentationWorld;
    const finalPresentationDiagnostics = copyDiagnostics(presentationWorld?.getDiagnostics?.() || {});
    const finalPublisherDiagnostics = copyPublisher(renderSystem?._presentationPublisher?.getDiagnostics?.() || {});
    const baselineDiagnostics = snapshot.presentationBaseline?.diagnostics;
    const readyDiagnostics = snapshot.presentationReady?.diagnostics;
    const baselinePublisher = snapshot.presentationBaseline?.publisher;
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
      miningDiagnosticStopped: !snapshot.miningDiagnosticArmed
        || (snapshot.miningDiagnosticStopped === true && vfxSystem?._miningBeam?.active !== true),
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
      miningDiagnosticStopped: !snapshot.miningDiagnosticArmed
        || (snapshot.miningDiagnosticStopped === true && vfxSystem?._miningBeam?.active !== true),
      playerNoInterp: !player?.flags || player.flags.noInterp === snapshot.player.noInterp,
      legacyAdapterRestored: snapshot.presentationWorldMode !== 'legacy-current'
        || (snapshot.legacyAdapterRestored === true
          && renderSystem?.syncEntityViews !== window.__SF_PRESENTATION_WORLD_LEGACY_ADAPTER__?.installed),
      frameOriginRestored: !snapshot.rebase?.applied
        || (state.world?.frameOrigin?.x === snapshot.rebase.before.x
          && state.world?.frameOrigin?.z === snapshot.rebase.before.z
          && renderSystem?._frameMembrane?.seq === state.world?.frameOriginSeq),
      presentationCountsRestored: !snapshot.presentationBaseline
        || (presentationWorld?.activeCount === snapshot.presentationBaseline.active
          && presentationWorld?.boundCount === snapshot.presentationBaseline.bound),
      presentationMeshesRestored: !snapshot.presentationBaseline
        || renderSystem?._meshes?.size === snapshot.presentationBaseline.meshes,
      presentationResourcesIdle: !snapshot.presentationBaseline
        || (Math.max(0, (renderSystem?._meshBuildQueue?.length || 0) - (renderSystem?._meshBuildQueueHead || 0)) === 0
          && renderSystem?._meshReconcileDirty !== true
          && Number(state.render?.scene?.userData?.authoredUpgradeDiagnostics?.activeJobs || 0) === 0),
      presentationLifecycleBalanced: !baselineDiagnostics
        || finalPresentationDiagnostics.allocations - baselineDiagnostics.allocations
          === finalPresentationDiagnostics.retirements - baselineDiagnostics.retirements,
      presentationCapacityBounded: !readyDiagnostics
        || (finalPresentationDiagnostics.capacity === readyDiagnostics.capacity
          && finalPresentationDiagnostics.highWater === readyDiagnostics.highWater
          && finalPresentationDiagnostics.growths === readyDiagnostics.growths),
      presentationNoRebuildOrError: !baselineDiagnostics
        || (finalPresentationDiagnostics.rebuilds === baselineDiagnostics.rebuilds
          && finalPresentationDiagnostics.staleHandleRejects === baselineDiagnostics.staleHandleRejects
          && finalPresentationDiagnostics.duplicateIdRejects === baselineDiagnostics.duplicateIdRejects
          && finalPresentationDiagnostics.chainGuardTrips === baselineDiagnostics.chainGuardTrips
          && finalPublisherDiagnostics.fullRebuilds === baselinePublisher.fullRebuilds
          && finalPublisherDiagnostics.fallbackRebuilds === baselinePublisher.fallbackRebuilds
          && finalPublisherDiagnostics.rangeFailures === baselinePublisher.rangeFailures
          && finalPublisherDiagnostics.applyFailures === baselinePublisher.applyFailures
          && finalPublisherDiagnostics.lastError === baselinePublisher.lastError),
    };
    const restored = Object.values(checks).every(Boolean);
    // A failed restoration is an owned recovery journal, not disposable evidence. Retaining it
    // prevents the next scenario from installing over a contaminated adapter/origin/state and
    // leaves the exact rollback owner available for diagnosis or a verified fallback restore.
    if (restored) delete window.__SF_PERFORMANCE_SCENARIO_RESTORE__;
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
      presentationWorld: snapshot.presentationBaseline ? {
        baseline: snapshot.presentationBaseline,
        final: {
          active: presentationWorld?.activeCount ?? null,
          bound: presentationWorld?.boundCount ?? null,
          meshes: renderSystem?._meshes?.size ?? null,
          capacity: presentationWorld?.capacity ?? null,
          free: presentationWorld?.freeCount ?? null,
          diagnostics: finalPresentationDiagnostics,
          publisher: finalPublisherDiagnostics,
        },
        ready: snapshot.presentationReady || null,
        resourcesReturned: checks.presentationCountsRestored
          && checks.presentationMeshesRestored
          && checks.presentationResourcesIdle,
      } : null,
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
    function copyDiagnostics(source) {
      const result = {};
      for (const key of [
        'capacity', 'active', 'bound', 'free', 'highWater', 'allocations', 'retirements',
        'rebuilds', 'growths', 'staleHandleRejects', 'duplicateIdRejects', 'spatialMoves',
        'chainGuardTrips', 'maxRadiusRecomputes',
      ]) result[key] = Number(source?.[key]) || 0;
      return result;
    }
    function copyPublisher(source) {
      const result = {};
      for (const key of [
        'appliedRecords', 'spawnRecords', 'destroyRecords', 'transformRecords', 'visualRecords',
        'idempotentFrames', 'fullRebuilds', 'fallbackRebuilds', 'rangeFailures', 'applyFailures',
      ]) result[key] = Number(source?.[key]) || 0;
      result.lastError = source?.lastError || null;
      return result;
    }
  }, scenarioId);
  log(`[scenario] restored ${scenarioId} ok=${receipt.restored}`);
  return receipt;
}

export function validateScenarioRestoration(receipt) {
  const failures = [];
  if (!receipt || receipt.restored !== true) failures.push('scenario restoration must report restored=true');
  const checks = receipt?.checks;
  if (!checks || typeof checks !== 'object' || Object.keys(checks).length === 0) {
    failures.push('scenario restoration checks are required');
  }
  for (const [key, value] of Object.entries(checks || {})) if (value !== true) failures.push(`scenario restoration check failed: ${key}`);
  if (Array.isArray(receipt?.remainingInjectedIds) && receipt.remainingInjectedIds.length) failures.push('injected entities remain after restoration');
  return { pass: failures.length === 0, failures };
}
