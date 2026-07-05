import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_FRAMES = 360;
const DEFAULT_WARMUP_FRAMES = 45;
const DEFAULT_MIN_INSPECTED_FRAMES = 300;
const PLAYER_LOD_SETTLE_FRAMES = 30;
const PLAYER_READABLE_SCREEN_RADIUS_PX = 80;
const PLAYER_MIN_VISIBLE_AUTHORED_SURFACES = 8;
const DEFAULT_FLIGHT_START_TIMEOUT_MS = 90000;
const WIDTH = readIntArg('--width', 1440);
const HEIGHT = readIntArg('--height', 900);
const FRAME_COUNT = readIntArg('--frames', DEFAULT_FRAMES);
const WARMUP_FRAMES = Math.min(readIntArg('--warmup-frames', DEFAULT_WARMUP_FRAMES), Math.max(0, FRAME_COUNT - 1));
const SF_BOOT_TIMEOUT_MS = readIntArg('--boot-timeout', Number(process.env.SF_VISUAL_STABILITY_BOOT_MS) || 90000);
const FLIGHT_START_TIMEOUT_MS = readIntArg('--flight-timeout', DEFAULT_FLIGHT_START_TIMEOUT_MS);

const { chromium } = await loadPlaywright();
let server = null;
let browser = null;

try {
  const requestedBaseUrl = process.env.SF_PROBE_URL || '';
  server = requestedBaseUrl ? { baseUrl: requestedBaseUrl } : await startFreshServer();
  browser = await launchProbeBrowser();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const pageIssues = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(withDebugFlight(server.baseUrl), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: SF_BOOT_TIMEOUT_MS });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Visual Stability Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });

  await waitForPlayableFlight(page, FLIGHT_START_TIMEOUT_MS);

  await page.waitForTimeout(750);
  const stability = await sampleVisualStability(page, {
    frames: FRAME_COUNT,
    warmupFrames: WARMUP_FRAMES,
    minInspectedFrames: DEFAULT_MIN_INSPECTED_FRAMES,
    playerLodSettleFrames: PLAYER_LOD_SETTLE_FRAMES,
    playerReadableScreenRadiusPx: PLAYER_READABLE_SCREEN_RADIUS_PX,
    playerMinVisibleAuthoredSurfaces: PLAYER_MIN_VISIBLE_AUTHORED_SURFACES,
  });
  const errorIssues = pageIssues.errorIssues();
  const ok = stability.failures.length === 0 && errorIssues.length === 0;
  console.log(JSON.stringify({
    ok,
    baseUrl: server.baseUrl,
    viewport: { width: WIDTH, height: HEIGHT },
    frames: FRAME_COUNT,
    warmupFrames: WARMUP_FRAMES,
    stability,
    pageErrors: summarizeIssues(errorIssues),
  }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server && server.kill) server.kill(); } catch (_) {}
}

async function sampleVisualStability(page, options) {
  return page.evaluate(async ({
    frames,
    warmupFrames,
    minInspectedFrames,
    playerLodSettleFrames,
    playerReadableScreenRadiusPx,
    playerMinVisibleAuthoredSurfaces,
  }) => {
    const failures = [];
    const tracks = new Map();
    const inspectedFrameCount = Math.max(0, frames - warmupFrames);
    let maxShipCount = 0;
    let finalShips = [];

    if (inspectedFrameCount < minInspectedFrames) {
      failures.push({
        frame: null,
        reason: 'insufficient-inspected-frames',
        detail: { inspectedFrameCount, minInspectedFrames },
        ship: null,
      });
    }

    for (let frame = 0; frame < frames; frame++) {
      const ships = captureShips(frame);
      maxShipCount = Math.max(maxShipCount, ships.length);
      finalShips = ships;
      if (frame >= warmupFrames) inspectFrame(frame, ships);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    inspectFinalPlayer(finalShips, Math.max(0, frames - 1));

    return {
      ok: failures.length === 0,
      frameCount: frames,
      warmupFrames,
      inspectedFrameCount,
      maxShipCount,
      failureCount: failures.length,
      failures: failures.slice(0, 80),
      trackedShips: Array.from(tracks.values()).map((track) => summarizeTrack(track)),
      finalShips: finalShips.map((ship) => summarizeShip(ship)),
    };

    function trackKey(ship) {
      return `${ship.id}:${ship.defId || 'unknown'}`;
    }

    function inspectFrame(frame, ships) {
      for (const ship of ships) {
        const key = trackKey(ship);
        let track = tracks.get(key);
        if (!track) {
          track = makeTrack(ship, frame);
          tracks.set(key, track);
        }

        if (ship.inView && !ship.meshExists) {
          fail(frame, ship, 'visible-ship-has-no-root-mesh', {});
        }
        if (ship.meshExists !== track.meshExists) {
          fail(frame, ship, 'mesh-existence-changed-after-warmup', { was: track.meshExists, now: ship.meshExists });
        }
        if (ship.rootUuid && track.rootUuid && ship.rootUuid !== track.rootUuid) {
          fail(frame, ship, 'mesh-root-changed', { was: track.rootUuid, now: ship.rootUuid });
        }
        if (ship.authoredState !== track.authoredState) {
          fail(frame, ship, 'authored-state-changed-after-warmup', { was: track.authoredState, now: ship.authoredState });
        }
        if (ship.compositionId !== track.compositionId) {
          fail(frame, ship, 'composition-changed-after-warmup', { was: track.compositionId, now: ship.compositionId });
        }
        if (ship.lodLevel !== track.lodLevel) {
          fail(frame, ship, 'lod-level-changed-after-warmup', { was: track.lodLevel, now: ship.lodLevel });
        }
        if (ship.slotsKey !== track.slotsKey) {
          fail(frame, ship, 'authored-slots-changed-after-warmup', { was: track.slotsKey, now: ship.slotsKey });
        }
        if (ship.meshCount !== track.meshCount) {
          fail(frame, ship, 'child-mesh-count-changed-after-warmup', { was: track.meshCount, now: ship.meshCount });
        }
        if (ship.authoredSurfaceCount !== track.authoredSurfaceCount) {
          fail(frame, ship, 'authored-surface-count-changed-after-warmup', { was: track.authoredSurfaceCount, now: ship.authoredSurfaceCount });
        }
        if (ship.staticBatchCount !== track.staticBatchCount) {
          fail(frame, ship, 'static-batch-count-changed-after-warmup', { was: track.staticBatchCount, now: ship.staticBatchCount });
        }
        if (ship.instanceProxyCount !== track.instanceProxyCount) {
          fail(frame, ship, 'instance-proxy-count-changed-after-warmup', { was: track.instanceProxyCount, now: ship.instanceProxyCount });
        }
        if (ship.authoredState !== 'authored') {
          fail(frame, ship, 'ship-not-authored-during-flight', { authoredState: ship.authoredState });
        }
        if (ship.inView && ship.visibleRenderableCount <= 0) {
          fail(frame, ship, 'visible-ship-has-no-renderable-meshes', {});
        }
        if (ship.inView && ship.rootVisible === false) {
          fail(frame, ship, 'visible-ship-root-hidden', {});
        }
        if (ship.inView && ship.visibleAuthoredSurfaceCount <= 0) {
          fail(frame, ship, 'visible-authored-ship-has-no-authored-surfaces', {});
        }
        if (ship.inView && ship.visibleRenderableCount > 0 && !(ship.maxWorldPrimitiveRadius > 0)) {
          fail(frame, ship, 'ship-bounds-disappeared', { maxWorldPrimitiveRadius: ship.maxWorldPrimitiveRadius });
        }
        if (ship.isPlayer && ship.inView && frame >= warmupFrames + playerLodSettleFrames
          && ship.screenRadiusPx >= playerReadableScreenRadiusPx && ship.lodLevel !== 'lod0') {
          fail(frame, ship, 'player-readable-ship-not-lod0', {
            lodLevel: ship.lodLevel,
            screenRadiusPx: ship.screenRadiusPx,
            minScreenRadiusPx: playerReadableScreenRadiusPx,
          });
        }
        if (ship.isPlayer && ship.inView && frame >= warmupFrames + playerLodSettleFrames
          && ship.screenRadiusPx >= playerReadableScreenRadiusPx
          && ship.visibleAuthoredSurfaceCount < playerMinVisibleAuthoredSurfaces) {
          fail(frame, ship, 'player-readable-ship-too-few-visible-authored-surfaces', {
            visibleAuthoredSurfaceCount: ship.visibleAuthoredSurfaceCount,
            minimum: playerMinVisibleAuthoredSurfaces,
          });
        }
        if (ship.inView && ship.boundsBad) {
          fail(frame, ship, 'ship-bounds-non-finite', {});
        }
        if (ship.inView && ship.entityRadius > 0 && ship.maxWorldPrimitiveRadius > ship.entityRadius * 12) {
          fail(frame, ship, 'ship-primitive-radius-exploded', {
            entityRadius: ship.entityRadius,
            maxWorldPrimitiveRadius: ship.maxWorldPrimitiveRadius,
          });
        }
        if (ship.inView && ship.screenRadiusPx > Math.max(window.innerWidth || 1, window.innerHeight || 1) * 2.2) {
          fail(frame, ship, 'ship-screen-bounds-exploded', { screenRadiusPx: ship.screenRadiusPx });
        }
        noteTrack(track, ship);
      }
    }

    function inspectFinalPlayer(ships, frame) {
      const player = (ships || []).find((ship) => ship && ship.isPlayer);
      if (!player) {
        fail(frame, null, 'player-ship-missing-from-final-visual-snapshot', {});
        return;
      }
      if (!player.inView || player.screenRadiusPx < playerReadableScreenRadiusPx) return;
      if (player.lodLevel !== 'lod0') {
        fail(frame, player, 'final-player-readable-ship-not-lod0', {
          lodLevel: player.lodLevel,
          screenRadiusPx: player.screenRadiusPx,
          minScreenRadiusPx: playerReadableScreenRadiusPx,
        });
      }
      if (player.visibleAuthoredSurfaceCount < playerMinVisibleAuthoredSurfaces) {
        fail(frame, player, 'final-player-readable-ship-too-few-visible-authored-surfaces', {
          visibleAuthoredSurfaceCount: player.visibleAuthoredSurfaceCount,
          minimum: playerMinVisibleAuthoredSurfaces,
        });
      }
    }

    function makeTrack(ship, frame) {
      return {
        id: ship.id,
        defId: ship.defId,
        firstFrame: frame,
        rootUuid: ship.rootUuid,
        meshExists: ship.meshExists,
        authoredState: ship.authoredState,
        authoredMode: ship.authoredMode,
        compositionId: ship.compositionId,
        slotsKey: ship.slotsKey,
        lodLevel: ship.lodLevel,
        meshCount: ship.meshCount,
        authoredSurfaceCount: ship.authoredSurfaceCount,
        staticBatchCount: ship.staticBatchCount,
        instanceProxyCount: ship.instanceProxyCount,
        framesSeen: 0,
        inViewFrames: 0,
        missingMeshFrames: 0,
        rootUuids: new Set(),
        authoredStates: new Set(),
        compositionIds: new Set(),
        lodLevels: new Set(),
        meshCounts: new Set(),
        staticBatchCounts: new Set(),
      };
    }

    function noteTrack(track, ship) {
      track.framesSeen++;
      if (ship.inView) track.inViewFrames++;
      if (!ship.meshExists) track.missingMeshFrames++;
      track.rootUuids.add(ship.rootUuid || 'missing');
      track.authoredStates.add(ship.authoredState || 'unknown');
      track.compositionIds.add(ship.compositionId || 'missing');
      track.lodLevels.add(ship.lodLevel == null ? 'none' : String(ship.lodLevel));
      track.meshCounts.add(String(ship.meshCount));
      track.staticBatchCounts.add(String(ship.staticBatchCount));
    }

    function fail(frame, ship, reason, detail) {
      if (failures.length >= 200) return;
      failures.push({
        frame,
        reason,
        detail,
        ship: ship ? summarizeShip(ship) : null,
      });
    }

    function captureShips(frame) {
      const sf = window.SF || null;
      const state = sf && sf.state || null;
      const render = state && state.render || null;
      const camera = render && render.camera || null;
      const renderer = render && render.renderer || null;
      const viewport = renderer && renderer.domElement
        ? {
          width: renderer.domElement.clientWidth || window.innerWidth || 1,
          height: renderer.domElement.clientHeight || window.innerHeight || 1,
        }
        : { width: window.innerWidth || 1, height: window.innerHeight || 1 };
      const entities = state && Array.isArray(state.entityList) ? state.entityList : [];
      const playerId = state && state.playerId;
      return entities
        .filter((entity) => entity && entity.type === 'ship' && entity.alive !== false)
        .map((entity) => inspectShip(entity, frame, camera, viewport, playerId))
        .filter(Boolean);
    }

    function inspectShip(entity, frame, camera, viewport, playerId) {
      const root = entity.mesh || (entity.view && entity.view.root) || null;
      if (!root || !root.userData) {
        const projectedFallback = projectEntityPosition(entity, camera);
        return {
          frame,
          id: entity.id,
          defId: entity.data && entity.data.defId || null,
          isPlayer: entity.id === playerId,
          team: entity.team,
          factionId: entity.factionId || null,
          entityRadius: Number(entity.radius) || 0,
          meshExists: false,
          rootUuid: null,
          rootName: '',
          rootVisible: false,
          authoredState: 'missing',
          authoredMode: null,
          compositionId: null,
          slotsKey: '{}',
          lodLevel: null,
          inView: projectedFallback.inView,
          screenRadiusPx: 0,
          meshCount: 0,
          visibleRenderableCount: 0,
          authoredSurfaceCount: 0,
          visibleAuthoredSurfaceCount: 0,
          staticBatchCount: 0,
          visibleStaticBatchCount: 0,
          instanceProxyCount: 0,
          maxWorldPrimitiveRadius: 0,
          boundsBad: false,
          largePrimitives: [],
        };
      }
      const data = root.userData || {};
      const Vector3 = root.position && root.position.constructor;
      const center = Vector3 ? new Vector3() : null;
      const projected = Vector3 ? new Vector3() : null;
      const offset = Vector3 ? new Vector3() : null;
      const scale = Vector3 ? new Vector3() : null;
      let inView = false;
      let screenRadiusPx = 0;

      try {
        root.updateWorldMatrix(true, true);
        if (camera && center && projected) {
          root.getWorldPosition(center);
          projected.copy(center).project(camera);
          inView = Number.isFinite(projected.x)
            && Number.isFinite(projected.y)
            && Number.isFinite(projected.z)
            && Math.abs(projected.x) <= 1.35
            && Math.abs(projected.y) <= 1.35
            && projected.z >= -1
            && projected.z <= 1;
        }
      } catch (_) {
        inView = false;
      }

      let meshCount = 0;
      let visibleRenderableCount = 0;
      let authoredSurfaceCount = 0;
      let visibleAuthoredSurfaceCount = 0;
      let staticBatchCount = 0;
      let visibleStaticBatchCount = 0;
      let instanceProxyCount = 0;
      let boundsBad = false;
      let maxWorldPrimitiveRadius = 0;
      const largePrimitives = [];

      root.traverse((object) => {
        if (!object) return;
        if (object.userData && object.userData.spacefaceInstanceProxy) instanceProxyCount++;
        if (!object.isMesh) return;
        meshCount++;
        const materialVisible = materialIsVisible(object.material);
        const worldVisible = visibleThroughRoot(object, root);
        if (worldVisible && materialVisible) visibleRenderableCount++;

        const isAuthoredSurface = !!(object.userData && (
          object.userData.spacefacePartUrl
          || object.userData.spacefaceStaticBatch
          || object.userData.spacefacePartUrls
        ));
        if (isAuthoredSurface) authoredSurfaceCount++;
        if (isAuthoredSurface && worldVisible && materialVisible) visibleAuthoredSurfaceCount++;
        if (object.userData && object.userData.spacefaceStaticBatch) {
          staticBatchCount++;
          if (worldVisible && materialVisible) visibleStaticBatchCount++;
        }

        const radius = worldPrimitiveRadius(object, scale);
        if (!Number.isFinite(radius)) {
          boundsBad = true;
          return;
        }
        if (radius > maxWorldPrimitiveRadius) maxWorldPrimitiveRadius = radius;
        if (radius > Math.max(1, entity.radius || 0) * 12) {
          largePrimitives.push({ name: object.name || '', radius });
        }
      });

      if (camera && center && projected && offset && maxWorldPrimitiveRadius > 0) {
        try {
          offset.set(center.x + maxWorldPrimitiveRadius, center.y, center.z).project(camera);
          if (Number.isFinite(offset.x)) {
            screenRadiusPx = Math.abs(offset.x - projected.x) * viewport.width * 0.5;
          }
        } catch (_) {
          boundsBad = true;
        }
      }

      return {
        frame,
        id: entity.id,
        defId: entity.data && entity.data.defId || null,
        isPlayer: entity.id === playerId,
        team: entity.team,
        factionId: entity.factionId || null,
        entityRadius: Number(entity.radius) || 0,
        meshExists: true,
        rootUuid: root.uuid || null,
        rootName: root.name || '',
        rootVisible: visibleThroughRoot(root, root),
        authoredState: data.authoredAssetState || 'unknown',
        authoredMode: data.authoredAssetMode || null,
        compositionId: data.authoredCompositionId || null,
        slotsKey: stableSlotKey(data.authoredSlots),
        lodLevel: data.lod && data.lod.level || null,
        inView,
        screenRadiusPx,
        meshCount,
        visibleRenderableCount,
        authoredSurfaceCount,
        visibleAuthoredSurfaceCount,
        staticBatchCount,
        visibleStaticBatchCount,
        instanceProxyCount,
        maxWorldPrimitiveRadius,
        boundsBad,
        largePrimitives: largePrimitives.slice(0, 5),
      };
    }

    function projectEntityPosition(entity, camera) {
      const Vector3 = camera && camera.position && camera.position.constructor;
      if (!Vector3 || !camera) return { inView: false };
      const pos = entity && entity.pos || {};
      const projected = new Vector3(Number(pos.x) || 0, Number(pos.y) || 0, Number(pos.z) || 0);
      try {
        projected.project(camera);
        return {
          inView: Number.isFinite(projected.x)
            && Number.isFinite(projected.y)
            && Number.isFinite(projected.z)
            && Math.abs(projected.x) <= 1.35
            && Math.abs(projected.y) <= 1.35
            && projected.z >= -1
            && projected.z <= 1,
        };
      } catch (_) {
        return { inView: false };
      }
    }

    function worldPrimitiveRadius(object, scale) {
      const geometry = object && object.geometry;
      if (!geometry) return 0;
      try {
        if (!geometry.boundingSphere && typeof geometry.computeBoundingSphere === 'function') {
          geometry.computeBoundingSphere();
        }
        const sourceRadius = geometry.boundingSphere && Number(geometry.boundingSphere.radius) || 0;
        if (!scale || typeof object.getWorldScale !== 'function') return sourceRadius;
        object.getWorldScale(scale);
        const maxScale = Math.max(Math.abs(scale.x || 0), Math.abs(scale.y || 0), Math.abs(scale.z || 0));
        return sourceRadius * maxScale;
      } catch (_) {
        return Number.NaN;
      }
    }

    function visibleThroughRoot(object, root) {
      for (let current = object; current; current = current.parent) {
        if (current.visible === false) return false;
        if (current === root) return true;
      }
      return false;
    }

    function materialIsVisible(material) {
      if (Array.isArray(material)) return material.some((entry) => !entry || entry.visible !== false);
      return !material || material.visible !== false;
    }

    function stableSlotKey(slots) {
      if (!slots || typeof slots !== 'object') return '{}';
      const pairs = Object.entries(slots)
        .map(([slot, urls]) => [slot, Array.isArray(urls) ? [...urls].sort() : []])
        .sort(([a], [b]) => a.localeCompare(b));
      return JSON.stringify(pairs);
    }

    function summarizeShip(ship) {
      return {
        id: ship.id,
        defId: ship.defId,
        isPlayer: ship.isPlayer,
        meshExists: ship.meshExists,
        authoredState: ship.authoredState,
        authoredMode: ship.authoredMode,
        compositionId: ship.compositionId,
        lodLevel: ship.lodLevel,
        inView: ship.inView,
        meshCount: ship.meshCount,
        visibleRenderableCount: ship.visibleRenderableCount,
        authoredSurfaceCount: ship.authoredSurfaceCount,
        visibleAuthoredSurfaceCount: ship.visibleAuthoredSurfaceCount,
        staticBatchCount: ship.staticBatchCount,
        visibleStaticBatchCount: ship.visibleStaticBatchCount,
        maxWorldPrimitiveRadius: roundFinite(ship.maxWorldPrimitiveRadius),
        screenRadiusPx: roundFinite(ship.screenRadiusPx),
        largePrimitives: ship.largePrimitives,
      };
    }

    function summarizeTrack(track) {
      return {
        id: track.id,
        defId: track.defId,
        firstFrame: track.firstFrame,
        framesSeen: track.framesSeen,
        inViewFrames: track.inViewFrames,
        missingMeshFrames: track.missingMeshFrames,
        rootUuids: Array.from(track.rootUuids).sort(),
        authoredStates: Array.from(track.authoredStates).sort(),
        compositionIds: Array.from(track.compositionIds).sort(),
        lodLevels: Array.from(track.lodLevels).sort(),
        meshCounts: Array.from(track.meshCounts).sort(),
        staticBatchCounts: Array.from(track.staticBatchCounts).sort(),
      };
    }

    function roundFinite(value) {
      return Number.isFinite(value) ? Number(value.toFixed(3)) : value;
    }
  }, options);
}

async function collectStartupSnapshot(page) {
  try {
    return await page.evaluate(async () => {
      const sf = window.SF || null;
      const state = sf && sf.state || null;
      const render = state && state.render || null;
      const ships = state && Array.isArray(state.entityList)
        ? state.entityList.filter((entity) => entity && entity.type === 'ship').map((entity) => ({
          id: entity.id,
          defId: entity.data && entity.data.defId || null,
          alive: entity.alive !== false,
          meshState: entity.mesh && entity.mesh.userData && entity.mesh.userData.authoredAssetState || null,
          compositionId: entity.mesh && entity.mesh.userData && entity.mesh.userData.authoredCompositionId || null,
        }))
        : [];
      let loaderDiagnostics = null;
      try {
        if (render && render.renderer) {
          const [assetLoader, partsLibrary] = await Promise.all([
            import('./src/render/assetLoader.js'),
            import('./src/render/partsLibrary.js'),
          ]);
          const { isReleaseAssetMode } = await import('./src/render/releaseMode.js');
          const release = isReleaseAssetMode();
          const partRoot = release ? partsLibrary.PART_LIBRARY_CONTRACT.releaseRoot : partsLibrary.PART_LIBRARY_CONTRACT.root;
          const failures = [];
          const slots = partsLibrary.PART_LIBRARY_CONTRACT.slots || {};
          for (const [slot, files] of Object.entries(slots)) {
            for (const file of files || []) {
              const url = `${partRoot}${file}`;
              const record = await assetLoader.loadAuthoredPart(url, { renderer: render.renderer, slot, optional: true });
              if (!record) {
                const error = await assetLoader.getAuthoredAssetDiagnostic(render.renderer, url, slot);
                failures.push({ slot, url, name: error && error.name || 'LoadFailure', message: error && error.message || 'asset returned no authored blueprint' });
              }
            }
          }
          loaderDiagnostics = { release, partRoot, failureCount: failures.length, failures: failures.slice(0, 8) };
        }
      } catch (error) {
        loaderDiagnostics = { error: error && error.message ? error.message : String(error) };
      }
      return {
        mode: state && state.mode || null,
        tick: state && state.tick || 0,
        timeScale: state && state.timeScale,
        playerId: state && state.playerId || null,
        ships,
        loaderDiagnostics,
      };
    });
  } catch (error) {
    return { error: error && error.message ? error.message : String(error) };
  }
}

async function waitForPlayableFlight(page, timeoutMs) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    await forceStartupRender(page);
    last = await collectStartupSnapshot(page);
    const ships = Array.isArray(last && last.ships) ? last.ships : [];
    if (last && last.mode === 'flight' && last.playerId && ships.some((ship) =>
      ship.id === last.playerId && ship.alive !== false && ship.meshState === 'authored')) {
      return last;
    }
    await page.waitForTimeout(150);
  }
  throw new Error(`flight did not become playable before visual stability probe: ${JSON.stringify(last)}`);
}

async function forceStartupRender(page) {
  try {
    await page.evaluate(async () => {
      const sf = window.SF || null;
      const state = sf && sf.state || null;
      const render = state && state.render || null;
      if (!state || !render || !render.scene || !render.renderer || !render.camera) return;
      for (const entity of state.entityList || []) {
        if (!entity || entity.type !== 'ship' || !entity.mesh) continue;
        entity.mesh.traverse((object) => { if (object) object.frustumCulled = false; });
      }
      try {
        const partsLibrary = await import('./src/render/partsLibrary.js');
        if (partsLibrary && typeof partsLibrary.syncAuthoredInstancePools === 'function') {
          partsLibrary.syncAuthoredInstancePools(render.scene);
        }
      } catch (_) {}
      render.renderer.render(render.scene, render.camera);
    });
  } catch (_) {}
}

async function launchProbeBrowser() {
  const executablePath = findSystemBrowser();
  if (executablePath) {
    try {
      return await chromium.launch({ headless: true, executablePath });
    } catch (error) {
      console.warn(`[ship-stability] system browser launch failed; falling back to bundled Chromium: ${error && error.message ? error.message : error}`);
    }
  }
  return chromium.launch({ headless: true });
}

function findSystemBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

async function startFreshServer() {
  const port = await findFreePort(8123);
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port) },
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHttp(baseUrl, 15000);
  return {
    baseUrl,
    kill() {
      try { child.kill(); } catch (_) {}
    },
  };
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(`server did not become ready at ${url}: ${lastError && lastError.message || 'timeout'}`);
}

async function findFreePort(preferred) {
  if (await portAvailable(preferred)) return preferred;
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function withDebugFlight(url) {
  const u = new URL(url);
  u.searchParams.set('debug', 'flight');
  return String(u);
}

function readIntArg(name, fallback) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!direct) return fallback;
  const value = Number.parseInt(direct.slice(name.length + 1), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
