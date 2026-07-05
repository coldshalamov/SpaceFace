import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_FRAMES = 360;
const DEFAULT_WARMUP_FRAMES = 45;
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
  browser = await chromium.launch({ headless: true });
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

  try {
    await page.waitForFunction(
      () => window.SF
        && window.SF.state
        && window.SF.state.mode === 'flight'
        && window.SF.state.playerId
        && window.SF.state.entities.get(window.SF.state.playerId)
        && window.SF.state.entities.get(window.SF.state.playerId).mesh,
      null,
      { timeout: FLIGHT_START_TIMEOUT_MS },
    );
  } catch (error) {
    const snapshot = await collectStartupSnapshot(page);
    throw new Error(`flight did not become playable before visual stability probe: ${JSON.stringify(snapshot)}`);
  }

  await page.waitForTimeout(750);
  const stability = await sampleVisualStability(page, { frames: FRAME_COUNT, warmupFrames: WARMUP_FRAMES });
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
  return page.evaluate(async ({ frames, warmupFrames }) => {
    const failures = [];
    const tracks = new Map();
    let maxShipCount = 0;
    let finalShips = [];

    for (let frame = 0; frame < frames; frame++) {
      const ships = captureShips(frame);
      maxShipCount = Math.max(maxShipCount, ships.length);
      finalShips = ships;
      if (frame >= warmupFrames) inspectFrame(frame, ships);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    return {
      ok: failures.length === 0,
      frameCount: frames,
      warmupFrames,
      maxShipCount,
      failureCount: failures.length,
      failures: failures.slice(0, 80),
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
          track = {
            rootUuid: ship.rootUuid,
            compositionId: ship.compositionId,
            slotsKey: ship.slotsKey,
            firstFrame: frame,
          };
          tracks.set(key, track);
        }

        if (ship.rootUuid && track.rootUuid && ship.rootUuid !== track.rootUuid) {
          fail(frame, ship, 'mesh-root-changed', { was: track.rootUuid, now: ship.rootUuid });
        }
        if (ship.compositionId !== track.compositionId) {
          fail(frame, ship, 'composition-changed-after-warmup', { was: track.compositionId, now: ship.compositionId });
        }
        if (ship.slotsKey !== track.slotsKey) {
          fail(frame, ship, 'authored-slots-changed-after-warmup', { was: track.slotsKey, now: ship.slotsKey });
        }
        if (ship.authoredState !== 'authored') {
          fail(frame, ship, 'ship-not-authored-during-flight', { authoredState: ship.authoredState });
        }
        if (ship.inView && ship.visibleRenderableCount <= 0) {
          fail(frame, ship, 'visible-ship-has-no-renderable-meshes', {});
        }
        if (ship.inView && ship.visibleAuthoredSurfaceCount <= 0) {
          fail(frame, ship, 'visible-authored-ship-has-no-authored-surfaces', {});
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
      }
    }

    function fail(frame, ship, reason, detail) {
      if (failures.length >= 200) return;
      failures.push({
        frame,
        reason,
        detail,
        ship: summarizeShip(ship),
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
      return entities
        .filter((entity) => entity && entity.type === 'ship' && entity.alive !== false)
        .map((entity) => inspectShip(entity, frame, camera, viewport))
        .filter(Boolean);
    }

    function inspectShip(entity, frame, camera, viewport) {
      const root = entity.mesh || (entity.view && entity.view.root) || null;
      if (!root || !root.userData) return null;
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
        team: entity.team,
        factionId: entity.factionId || null,
        entityRadius: Number(entity.radius) || 0,
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
        maxWorldPrimitiveRadius: Number(ship.maxWorldPrimitiveRadius.toFixed(3)),
        screenRadiusPx: Number(ship.screenRadiusPx.toFixed(3)),
        largePrimitives: ship.largePrimitives,
      };
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
