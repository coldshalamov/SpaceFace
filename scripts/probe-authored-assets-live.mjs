#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WIDTH = 1440;
const HEIGHT = 900;
const SHOT = process.env.SF_ASSETS_LIVE_SHOT || '.devshots/authored-assets-live.jpg';
const REPORT = process.env.SF_ASSETS_LIVE_REPORT || '';
const LOG = process.env.SF_ASSETS_LIVE_LOG || '';
const REQUIRED_PLAYER_MODULAR_SLOTS = ['hull', 'cockpit', 'engine', 'weapon', 'pod', 'gear', 'greeble'];
// A complete whole-ship body owns its visible hardpoints, pods, gear, and greebles inside the hull
// record. Requiring modular duplicates here would stack old hardware on the production body.
const REQUIRED_PLAYER_WHOLE_SHIP_SLOTS = ['hull'];
const MIN_AUTHORED_SHIPS = 3;
const RELEASE_PART_ROOT = 'assets/ships/release/parts/';
const AUTHORED_BODY_PROOF = Object.freeze({
  minSurfaceCount: 1,
  minRadiusRatio: 0.20,
  minDiagonalRatio: 0.50,
  minBodyToReadabilityDiagonalRatio: 0.35,
});
// Must exceed main.js' authored-visual startup wait so this probe observes the same no-fallback
// default path instead of racing the loading gate.
const PLAYABLE_TIMEOUT_MS = readPositiveIntArg('--playable-timeout', Number(process.env.SF_ASSETS_LIVE_TIMEOUT_MS) || 90000);

let server = null;
let chrome = null;
let ws = null;

try {
  server = await startFreshServer();
  const debugPort = await findFreePort(9801);
  chrome = spawnChrome(debugPort);
  const cdp = await connectCdp(debugPort);
  ws = cdp.ws;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}",
  });

  const pageIssues = collectPageIssues(cdp);
  const probeRoute = withDebugFlight(server.baseUrl);
  await cdp.send('Page.navigate', { url: probeRoute });
  await waitFor(cdp, isBootReady, 15000, 'SpaceFace debug runtime');
  await installStartupTrace(cdp);

  await evalVoid(cdp, `(() => {
    window.SF.bus.emit('game:new', { name: 'Authored Asset Live Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  })()`);
  let playable;
  try {
    playable = await waitFor(cdp, isPlayable, PLAYABLE_TIMEOUT_MS, 'seeded flight session');
  } catch (error) {
    const startupReport = await collectAuthoredReport(cdp).catch((reportError) => ({
      error: reportError && reportError.message ? reportError.message : String(reportError),
    }));
    const startupTrace = await getStartupTrace(cdp).catch(() => []);
    throw new Error(`seeded flight session did not become playable before authored asset proof: ${JSON.stringify(compactStartupFailure(startupReport, startupTrace, error), null, 2)}`);
  }
  const startTick = playable.tick;

  const report = await waitForAuthoredShips(cdp);
  await waitFor(cdp, () => getTick(cdp, startTick + 2), 10000, 'advancing gameplay ticks');

  await captureScreenshot(cdp, SHOT);
  const browserIdentity = await collectBrowserIdentity(cdp);

  const player = report.player;
  const startupTrace = await getStartupTrace(cdp);
  const badFlightSnapshots = startupTrace.filter((entry) => entry.mode === 'flight' && entry.nonAuthored > 0);
  assert.equal(report.mode, 'flight', 'live probe should be in playable flight mode');
  assert.deepEqual(badFlightSnapshots, [],
    `flight mode must not become active until live ships are authored: ${JSON.stringify(badFlightSnapshots)}`);
  assert.ok(report.tick >= startTick, 'gameplay tick should be advancing after authored startup readiness');
  assert.ok(player, 'player ship should be present in the live scene');
  assert.equal(player.state, 'authored', 'player ship should be authored before playable flight starts');
  assert.equal(player.mode, 'release', 'player ship should use the default release authored-asset mode');
  assert.deepEqual(player.missingRequiredSlots, [],
    `player ship should expose required ${player.requiredSlotMode || 'authored'} GLB slots: ${(player.requiredPlayerSlots || REQUIRED_PLAYER_MODULAR_SLOTS).join(', ')}; loader=${JSON.stringify(report.loaderDiagnostics && report.loaderDiagnostics.failures || [])}`);
  assert.ok(!player.fallbackParts.includes('hull'),
    `player ship must not silently use a procedural hull fallback: ${JSON.stringify(player.fallbackParts)}`);
  assert.equal(player.authoredBodyProof && player.authoredBodyProof.ok, true,
    `player ship must have visible authored hull/body coverage, not only fragments or the readability shell: ${JSON.stringify(player.authoredBodyProof)}`);
  assert.deepEqual(player.slotUrlsMissingFromGraph, [],
    'player authoredSlots should correspond to live Object3D part URLs');
  assert.ok(report.authoredShipCount >= MIN_AUTHORED_SHIPS,
    `expected at least ${MIN_AUTHORED_SHIPS} authored live ships; got ${report.authoredShipCount}`);
  assert.equal(report.authoredShipCount, report.shipCount,
    `all live ships should be authored in playable flight: ${JSON.stringify(report.ships.filter((ship) => ship.state !== 'authored').map(summarizeShip))}`);
  assert.deepEqual(report.ships.filter((ship) => !(ship.authoredBodyProof && ship.authoredBodyProof.ok)).map(summarizeShip), [],
    'all live authored ships should include a main hull/body-sized authored surface');
  assert.deepEqual(report.ships.filter((ship) => ship.state === 'authored' && ship.mode !== 'release').map(summarizeShip), [],
    'all authored live ships should use release asset mode');
  assert.equal(report.loaderDiagnostics.available, true,
    `authored asset runtime diagnostics should be available: ${JSON.stringify(report.loaderDiagnostics)}`);
  assert.equal(report.loaderDiagnostics.release, true, 'live asset probe should exercise default release mode');
  assert.equal(report.loaderDiagnostics.partRoot, RELEASE_PART_ROOT,
    'default live authored parts should load from the generated release asset root');
  assert.equal(report.loaderDiagnostics.loadedCount, report.loaderDiagnostics.declaredCount,
    `all declared authored GLB parts should load successfully: ${JSON.stringify(report.loaderDiagnostics.failures || [])}`);
  assert.equal(report.loaderDiagnostics.wholeShipFailureCount, 0,
    `all live-declared whole-ship GLBs should load as authored hull/body assets: ${JSON.stringify(report.loaderDiagnostics.failures || [])}`);
  assert.deepEqual(report.nonReleasePartUrls, [],
    `visible authored ships should reference release GLBs only: ${JSON.stringify(report.nonReleasePartUrls)}`);
  assert.ok(report.instancePoolCount + report.staticBatchCount > 0,
    'authored opaque GLB primitives should be wired into scene static batches or instance pools');
  assert.ok(report.instancePoolLiveCount + report.staticBatchCount > 0,
    'scene should contain live authored GLB static batches or pooled instances');
  assert.equal(report.loaderDiagnostics.failureCount, 0,
    `all declared authored GLB parts should pass the live runtime loader: ${JSON.stringify(report.loaderDiagnostics.failures || [])}`);
  assert.deepEqual(pageIssues.errorIssues(), [], 'browser page should not report runtime errors during the asset probe');

  const output = {
    route: probeRoute,
    inputSource: 'fixture',
    injectedState: true,
    fixture: {
      seed: 47,
      internalEvents: ['game:new', 'ui:closeAll'],
    },
    viewport: { width: WIDTH, height: HEIGHT },
    browser: browserIdentity,
    gpu: browserIdentity.webgl,
    mode: report.mode,
    tick: report.tick,
    shipCount: report.shipCount,
    authoredShipCount: report.authoredShipCount,
    instancePoolCount: report.instancePoolCount,
    instancePoolLiveCount: report.instancePoolLiveCount,
    staticBatchCount: report.staticBatchCount,
    loaderDiagnostics: {
      available: report.loaderDiagnostics.available,
      release: report.loaderDiagnostics.release,
      partRoot: report.loaderDiagnostics.partRoot,
      declaredCount: report.loaderDiagnostics.declaredCount,
      loadedCount: report.loaderDiagnostics.loadedCount,
      failureCount: report.loaderDiagnostics.failureCount,
      wholeShipDeclaredCount: report.loaderDiagnostics.wholeShipDeclaredCount,
      wholeShipLoadedCount: report.loaderDiagnostics.wholeShipLoadedCount,
      wholeShipFailureCount: report.loaderDiagnostics.wholeShipFailureCount,
    },
    player: summarizeShip(player),
    authoredShips: report.authoredShips.map(summarizeShip),
    startupTrace,
    screenshot: SHOT,
  };
  const renderedOutput = JSON.stringify(output, null, 2);
  if (REPORT) writeJsonReport(REPORT, output);
  if (LOG) writeTextReport(LOG, `Authored GLB live probe PASS\n${renderedOutput}\n`);
  console.log('Authored GLB live probe PASS');
  console.log(renderedOutput);
} finally {
  await closeWebSocket(ws);
  await terminateChild(chrome);
  if (server && server.child) await terminateChild(server.child);
  else {
    try { if (server && server.kill) server.kill(); } catch (_) {}
  }
}

async function waitForAuthoredShips(cdp) {
  let last = null;
  const started = Date.now();
  while (Date.now() - started < 45000) {
    await forceShipRender(cdp);
    last = await collectAuthoredReport(cdp);
    if (last.player
      && last.player.state === 'authored'
      && last.player.missingRequiredSlots.length === 0
      && last.player.slotUrlsMissingFromGraph.length === 0
      && last.shipCount >= MIN_AUTHORED_SHIPS
      && last.authoredShipCount === last.shipCount
      && last.ships.every((ship) => ship.authoredBodyProof && ship.authoredBodyProof.ok)
      && last.loaderDiagnostics.available
      && last.loaderDiagnostics.loadedCount === last.loaderDiagnostics.declaredCount
      && last.loaderDiagnostics.wholeShipFailureCount === 0
      && last.nonReleasePartUrls.length === 0
      && (last.instancePoolLiveCount + last.staticBatchCount) > 0) {
      return last;
    }
    await sleep(250);
  }
  throw new Error(`timeout waiting for authored GLB ships before playable flight; last=${JSON.stringify(last, null, 2)}`);
}

async function collectAuthoredReport(cdp) {
  return evalJson(cdp, `(async () => {
    const requiredPlayerModularSlots = ${JSON.stringify(REQUIRED_PLAYER_MODULAR_SLOTS)};
    const requiredPlayerWholeShipSlots = ${JSON.stringify(REQUIRED_PLAYER_WHOLE_SHIP_SLOTS)};
    const authoredBodyProof = ${JSON.stringify(AUTHORED_BODY_PROOF)};
    const sf = window.SF || null;
    const state = sf && sf.state || null;
    const scene = state && state.render && state.render.scene || null;
    const ships = state && Array.isArray(state.entityList)
      ? state.entityList.filter((entity) => entity && entity.type === 'ship' && entity.alive !== false)
      : [];
    const reports = ships.map((entity) => inspectShip(entity, state)).filter(Boolean);
    const authoredShips = reports.filter((entry) => entry.state === 'authored');
    const player = reports.find((entry) => entry.id === state.playerId) || null;
    const nonReleasePartUrls = [...new Set(reports
      .flatMap((entry) => Object.values(entry.slots || {}).flat())
      .filter((url) => !String(url || '').startsWith('assets/ships/release/parts/')))];
    const instancePools = [];
    let staticBatchCount = 0;
    if (scene) {
      scene.traverse((object) => {
        if (object && object.isInstancedMesh && object.userData && object.userData.spacefaceInstancePool) {
          instancePools.push({ name: object.name || '', count: object.count || 0 });
        } else if (object && object.isMesh && object.userData && object.userData.spacefaceStaticBatch) {
          staticBatchCount++;
        }
      });
    }
    const loaderDiagnostics = await collectLoaderDiagnostics(state);
    return {
      mode: state && state.mode || null,
      tick: state && state.tick || 0,
      playerId: state && state.playerId || null,
      shipCount: ships.length,
      authoredShipCount: authoredShips.length,
      instancePoolCount: instancePools.length,
      instancePoolLiveCount: instancePools.reduce((sum, pool) => sum + (pool.count || 0), 0),
      staticBatchCount,
      loaderDiagnostics,
      nonReleasePartUrls,
      player,
      authoredShips,
      ships: reports,
    };

    function inspectShip(entity, state) {
      const root = entity.mesh || (entity.view && entity.view.root) || null;
      if (!root || !root.userData) return null;
      const data = root.userData || {};
      const authoredSlots = normalizeSlotMap(data.authoredSlots);
      const graphSlots = {};
      const partUrls = new Set();
      let meshCount = 0;
      let partObjectCount = 0;
      let instanceProxyCount = 0;
      let staticBatchCount = 0;
      const childNames = [];
      root.traverse((object) => {
        if (!object) return;
        if (object !== root && object.parent === root) childNames.push(object.name || '');
        if (object.isMesh) meshCount++;
        if (object.userData && object.userData.spacefaceInstanceProxy) instanceProxyCount++;
        if (object.userData && object.userData.spacefaceStaticBatch) staticBatchCount++;
        const urls = object.userData && Array.isArray(object.userData.spacefacePartUrls)
          ? object.userData.spacefacePartUrls
          : (object.userData && object.userData.spacefacePartUrl ? [object.userData.spacefacePartUrl] : []);
        if (!urls.length) return;
        partObjectCount++;
        for (const url of urls) {
          partUrls.add(url);
          const slot = slotFromUrl(url);
          if (!graphSlots[slot]) graphSlots[slot] = [];
          if (!graphSlots[slot].includes(url)) graphSlots[slot].push(url);
        }
      });
      const slotUrls = Object.values(authoredSlots).flat();
      const slotUrlsMissingFromGraph = slotUrls.filter((url) => !partUrls.has(url));
      const presentSlots = Object.keys(authoredSlots).filter((slot) => authoredSlots[slot].length > 0);
      const wholeShipBodyUrls = slotUrls.filter(isWholeShipUrl);
      const requiredPlayerSlots = wholeShipBodyUrls.length ? requiredPlayerWholeShipSlots : requiredPlayerModularSlots;
      const missingRequiredSlots = entity.id === state.playerId
        ? requiredPlayerSlots.filter((slot) => !presentSlots.includes(slot))
        : [];
      const bodyProof = inspectAuthoredBodyProof(root, entity);
      return {
        id: entity.id,
        defId: entity.data && entity.data.defId || null,
        scenarioActorId: entity.data && entity.data.scenarioActorId || null,
        team: entity.team,
        factionId: entity.factionId || null,
        state: data.authoredAssetState || 'unknown',
        mode: data.authoredAssetMode || null,
        compositionId: data.authoredCompositionId || null,
        childNames,
        slots: authoredSlots,
        graphSlots: normalizeSlotMap(graphSlots),
        requiredSlotMode: wholeShipBodyUrls.length ? 'whole-ship' : 'modular',
        requiredPlayerSlots: entity.id === state.playerId ? requiredPlayerSlots : [],
        wholeShipBodyUrls,
        missingRequiredSlots,
        slotUrlsMissingFromGraph,
        fallbackParts: Array.isArray(data.proceduralFallbackParts) ? data.proceduralFallbackParts.slice() : [],
        partObjectCount,
        meshCount,
        instanceProxyCount,
        staticBatchCount,
        authoredBodyProof: bodyProof,
      };
    }

    function inspectAuthoredBodyProof(root, entity) {
      const metrics = {
        ok: false,
        failures: [],
        thresholds: authoredBodyProof,
        entityRadius: roundFinite(Number(entity && entity.radius) || 0),
        bodySurfaceCount: 0,
        visibleBodySurfaceCount: 0,
        bodyTriangleCount: 0,
        bodyBounds: emptyBounds(),
        readabilitySurfaceCount: 0,
        visibleReadabilitySurfaceCount: 0,
        readabilityBounds: emptyBounds(),
        bodyRadiusRatio: 0,
        bodyDiagonalRatio: 0,
        bodyToReadabilityDiagonalRatio: null,
      };
      const Vector3 = root && root.position && root.position.constructor;
      if (!root || !Vector3) {
        metrics.failures.push({ reason: 'missing-root-or-vector' });
        return metrics;
      }
      const bodyBounds = makeBoundsAccumulator();
      const readabilityBounds = makeBoundsAccumulator();
      try {
        root.updateWorldMatrix(true, true);
      } catch (_) {}
      root.traverse((object) => {
        if (!object || !object.isMesh) return;
        const urls = partUrlsForObject(object);
        const isReadability = !!(object.userData && object.userData.spacefaceReadabilityCore)
          || urls.some((url) => String(url || '').includes('readability/'));
        const isBody = urls.some(isAuthoredBodyUrl) && !isReadability;
        if (!isBody && !isReadability) return;
        const visible = visibleThroughRoot(object, root) && materialIsVisible(object.material);
        const bounds = meshWorldBounds(object, Vector3);
        if (!bounds.ok) return;
        if (isReadability) {
          metrics.readabilitySurfaceCount++;
          if (visible) metrics.visibleReadabilitySurfaceCount++;
          readabilityBounds.include(bounds);
        }
        if (isBody) {
          metrics.bodySurfaceCount++;
          if (visible) metrics.visibleBodySurfaceCount++;
          metrics.bodyTriangleCount += triangleCount(object.geometry);
          bodyBounds.include(bounds);
        }
      });
      metrics.bodyBounds = bodyBounds.summary();
      metrics.readabilityBounds = readabilityBounds.summary();
      const radius = Number(entity && entity.radius) || 0;
      metrics.bodyRadiusRatio = roundFinite(radius > 0 ? metrics.bodyBounds.radius / radius : 0);
      metrics.bodyDiagonalRatio = roundFinite(radius > 0 ? metrics.bodyBounds.diagonal / radius : 0);
      if (metrics.readabilityBounds.diagonal > 0) {
        metrics.bodyToReadabilityDiagonalRatio = roundFinite(metrics.bodyBounds.diagonal / metrics.readabilityBounds.diagonal);
      }
      if (metrics.bodySurfaceCount < authoredBodyProof.minSurfaceCount) {
        metrics.failures.push({
          reason: 'missing-authored-body-surface',
          bodySurfaceCount: metrics.bodySurfaceCount,
          minimum: authoredBodyProof.minSurfaceCount,
        });
      }
      if (metrics.visibleBodySurfaceCount < authoredBodyProof.minSurfaceCount) {
        metrics.failures.push({
          reason: 'missing-visible-authored-body-surface',
          visibleBodySurfaceCount: metrics.visibleBodySurfaceCount,
          minimum: authoredBodyProof.minSurfaceCount,
        });
      }
      if (radius > 0 && metrics.bodyRadiusRatio < authoredBodyProof.minRadiusRatio) {
        metrics.failures.push({
          reason: 'authored-body-radius-too-small',
          bodyRadiusRatio: metrics.bodyRadiusRatio,
          minimum: authoredBodyProof.minRadiusRatio,
        });
      }
      if (radius > 0 && metrics.bodyDiagonalRatio < authoredBodyProof.minDiagonalRatio) {
        metrics.failures.push({
          reason: 'authored-body-bounds-too-small',
          bodyDiagonalRatio: metrics.bodyDiagonalRatio,
          minimum: authoredBodyProof.minDiagonalRatio,
        });
      }
      if (metrics.readabilityBounds.diagonal > 0
        && metrics.bodyToReadabilityDiagonalRatio < authoredBodyProof.minBodyToReadabilityDiagonalRatio) {
        metrics.failures.push({
          reason: 'readability-shell-carrying-silhouette',
          bodyToReadabilityDiagonalRatio: metrics.bodyToReadabilityDiagonalRatio,
          minimum: authoredBodyProof.minBodyToReadabilityDiagonalRatio,
        });
      }
      metrics.ok = metrics.failures.length === 0;
      return metrics;
    }

    function partUrlsForObject(object) {
      if (!object || !object.userData) return [];
      if (Array.isArray(object.userData.spacefacePartUrls)) return object.userData.spacefacePartUrls.filter(Boolean);
      return object.userData.spacefacePartUrl ? [object.userData.spacefacePartUrl] : [];
    }

    function isAuthoredBodyUrl(url) {
      const text = String(url || '');
      return text.includes('/hulls/') || text.includes('/wholeships/') || text.includes('hero/kestrel');
    }

    function meshWorldBounds(object, Vector3) {
      const geometry = object && object.geometry;
      if (!geometry) return { ok: false };
      try {
        if (!geometry.boundingBox && typeof geometry.computeBoundingBox === 'function') geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box) return { ok: false };
        object.updateWorldMatrix(true, false);
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        const point = new Vector3();
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              point.set(x, y, z).applyMatrix4(object.matrixWorld);
              if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
                return { ok: false };
              }
              min[0] = Math.min(min[0], point.x); min[1] = Math.min(min[1], point.y); min[2] = Math.min(min[2], point.z);
              max[0] = Math.max(max[0], point.x); max[1] = Math.max(max[1], point.y); max[2] = Math.max(max[2], point.z);
            }
          }
        }
        return { ok: true, min, max };
      } catch (_) {
        return { ok: false };
      }
    }

    function makeBoundsAccumulator() {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      return {
        include(bounds) {
          if (!bounds || !bounds.ok) return;
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], bounds.min[i]);
            max[i] = Math.max(max[i], bounds.max[i]);
          }
        },
        summary() {
          if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return emptyBounds();
          const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
          const diagonal = Math.hypot(size[0], size[1], size[2]);
          return {
            size: size.map(roundFinite),
            diagonal: roundFinite(diagonal),
            radius: roundFinite(diagonal * 0.5),
            maxAxis: roundFinite(Math.max(size[0], size[1], size[2])),
          };
        },
      };
    }

    function emptyBounds() {
      return { size: [0, 0, 0], diagonal: 0, radius: 0, maxAxis: 0 };
    }

    function triangleCount(geometry) {
      if (!geometry) return 0;
      const index = typeof geometry.getIndex === 'function' ? geometry.getIndex() : geometry.index;
      if (index && Number.isFinite(index.count)) return Math.floor(index.count / 3);
      const position = geometry.getAttribute && geometry.getAttribute('position');
      return position && Number.isFinite(position.count) ? Math.floor(position.count / 3) : 0;
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

    function roundFinite(value) {
      return Number.isFinite(value) ? Number(value.toFixed(3)) : value;
    }

    function normalizeSlotMap(value) {
      const result = {};
      if (!value || typeof value !== 'object') return result;
      for (const [slot, urls] of Object.entries(value)) {
        result[slot] = Array.isArray(urls) ? [...new Set(urls)] : [];
      }
      return result;
    }

    function slotFromUrl(url) {
      const text = String(url || '');
      if (isWholeShipUrl(text)) return 'wholeShip';
      if (text.includes('/hulls/')) return 'hull';
      if (text.includes('/cockpits/')) return 'cockpit';
      if (text.includes('/engines/')) return 'engine';
      if (text.includes('/fins/')) return 'fin';
      if (text.includes('/weapons/')) return 'weapon';
      if (text.includes('/greebles/')) return 'greeble';
      if (text.includes('/gear/')) return 'gear';
      if (text.includes('/pods/')) return 'pod';
      return 'unknown';
    }

    function isWholeShipUrl(url) {
      return String(url || '').includes('/wholeships/');
    }

    function liveWholeShipFiles(partsLibrary) {
      if (!partsLibrary || typeof partsLibrary.shipArchetypesForPrecompile !== 'function') return [];
      try {
        return [...new Set(partsLibrary.shipArchetypesForPrecompile()
          .map((entry) => entry && entry.wholeShipFile)
          .filter(Boolean))];
      } catch (_) {
        return [];
      }
    }

    async function collectLoaderDiagnostics(state) {
      try {
        const renderer = state && state.render && state.render.renderer || null;
        if (!renderer) return { available: false, error: 'renderer unavailable' };
        const [assetLoader, partsLibrary] = await Promise.all([
          import('./src/render/assetLoader.js'),
          import('./src/render/partsLibrary.js'),
        ]);
        const runtime = await assetLoader.getAuthoredAssetRuntimeInfo(renderer);
        const failures = [];
        const loaded = [];
        const wholeShipFailures = [];
        const wholeShipLoaded = [];
        const contract = partsLibrary.PART_LIBRARY_CONTRACT || {};
        const { isReleaseAssetMode } = await import('./src/render/releaseMode.js');
        const release = isReleaseAssetMode();
        const partRoot = release ? contract.releaseRoot : contract.root;
        const slots = contract.slots || {};
        const requiredWholeShipFiles = liveWholeShipFiles(partsLibrary);
        for (const [slot, files] of Object.entries(slots)) {
          for (const file of files || []) {
            const url = String(partRoot || 'assets/ships/parts/') + file;
            const record = await assetLoader.loadAuthoredPart(url, { renderer, slot, optional: true });
            if (record) {
              loaded.push({
                slot,
                url,
                assetId: record.assetId || null,
                primitiveCount: record.primitives ? record.primitives.length : 0,
                markerCount: record.markers ? record.markers.length : 0,
              });
            } else {
              const error = await assetLoader.getAuthoredAssetDiagnostic(renderer, url, slot);
              failures.push({
                slot,
                url,
                name: error && error.name || 'LoadFailure',
                message: error && error.message || 'asset returned no authored blueprint',
              });
            }
          }
        }
        for (const file of requiredWholeShipFiles) {
          const url = String(partRoot || 'assets/ships/parts/') + file;
          const record = await assetLoader.loadAuthoredPart(url, { renderer, slot: 'hull', optional: true });
          if (record) {
            wholeShipLoaded.push({
              slot: 'wholeShip',
              url,
              assetId: record.assetId || null,
              primitiveCount: record.primitives ? record.primitives.length : 0,
              markerCount: record.markers ? record.markers.length : 0,
            });
          } else {
            const error = await assetLoader.getAuthoredAssetDiagnostic(renderer, url, 'hull');
            wholeShipFailures.push({
              slot: 'wholeShip',
              url,
              name: error && error.name || 'LoadFailure',
              message: error && error.message || 'whole-ship asset returned no authored hull/body blueprint',
            });
          }
        }
        const declaredPartCount = Object.values(slots).reduce((sum, files) => sum + ((files || []).length), 0);
        return {
          available: true,
          runtime,
          release,
          partRoot,
          declaredCount: declaredPartCount + requiredWholeShipFiles.length,
          declaredPartCount,
          loadedCount: loaded.length + wholeShipLoaded.length,
          loadedSlots: loaded.reduce((slots, entry) => {
            slots[entry.slot] = (slots[entry.slot] || 0) + 1;
            return slots;
          }, {}),
          wholeShipDeclaredCount: requiredWholeShipFiles.length,
          wholeShipLoadedCount: wholeShipLoaded.length,
          wholeShipFailureCount: wholeShipFailures.length,
          failureCount: failures.length + wholeShipFailures.length,
          failures: [...failures, ...wholeShipFailures].slice(0, 12),
        };
      } catch (error) {
        return {
          available: false,
          error: error && error.message ? error.message : String(error),
        };
      }
    }
  })()`);
}

async function forceShipRender(cdp) {
  await evalVoid(cdp, `(async () => {
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
  })()`);
}

function isBootReady(cdp) {
  return evalJson(cdp, `(() => ({
    ready: !!(window.SF && window.SF.state && window.SF.bus && window.SF.state.render && window.SF.state.render.renderer),
  }))()`).then((value) => value.ready === true);
}

async function installStartupTrace(cdp) {
  await evalVoid(cdp, `(() => {
    const sf = window.SF || null;
    if (!sf || !sf.bus || !sf.state || window.__SF_AUTHORED_ASSET_STARTUP_TRACE__) return;
    const trace = [];
    const snapshot = (label) => {
      const state = sf.state || {};
      const ships = Array.isArray(state.entityList)
        ? state.entityList.filter((entity) => entity && entity.type === 'ship' && entity.alive !== false)
        : [];
      const states = {};
      for (const ship of ships) {
        const root = ship.mesh || (ship.view && ship.view.root) || null;
        const assetState = root && root.userData && root.userData.authoredAssetState || 'missing-mesh';
        states[assetState] = (states[assetState] || 0) + 1;
      }
      const authored = states.authored || 0;
      trace.push({
        label,
        mode: state.mode || null,
        tick: state.tick || 0,
        shipCount: ships.length,
        authored,
        states,
        nonAuthored: Math.max(0, ships.length - authored),
      });
    };
    window.__SF_AUTHORED_ASSET_STARTUP_TRACE__ = trace;
    sf.bus.on('mode:changed', () => snapshot('mode:changed'));
    sf.bus.on('game:started', () => snapshot('game:started'));
    sf.bus.on('game:startFailed', () => snapshot('game:startFailed'));
    snapshot('installed');
  })()`);
}

async function getStartupTrace(cdp) {
  return evalJson(cdp, `(() => window.__SF_AUTHORED_ASSET_STARTUP_TRACE__ || [])()`);
}

function isPlayable(cdp) {
  return evalJson(cdp, `(() => {
    const sf = window.SF || null;
    const state = sf && sf.state || null;
    const player = state && state.entities && state.entities.get(state.playerId);
    return {
      ready: !!(state && state.mode === 'flight' && player && player.alive !== false && player.mesh),
      mode: state && state.mode || null,
      playerId: state && state.playerId || null,
      hasPlayer: !!player,
      playerAlive: !!(player && player.alive !== false),
      hasPlayerMesh: !!(player && player.mesh),
      entityCount: state && state.entities && state.entities.size || 0,
      tick: state && state.tick || 0,
    };
  })()`);
}

function getTick(cdp, minimum) {
  return evalJson(cdp, `(() => ({ tick: window.SF && window.SF.state ? window.SF.state.tick : 0 }))()`)
    .then((value) => value.tick >= minimum);
}

function collectPageIssues(cdp) {
  const issues = [];
  const warnings = [];
  cdp.onMessage((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const text = msg.params && msg.params.exceptionDetails
        ? (msg.params.exceptionDetails.text || msg.params.exceptionDetails.exception?.description || 'exception')
        : 'exception';
      issues.push({ type: 'pageerror', text });
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params && msg.params.type === 'error') {
      const text = (msg.params.args || []).map((arg) => arg.value || arg.description || '').join(' ');
      const issue = { type: 'error', text };
      if (!isIgnorablePageIssue(issue)) issues.push(issue);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params && msg.params.type === 'warning') {
      const text = (msg.params.args || []).map((arg) => arg.value || arg.description || '').join(' ');
      warnings.push({ type: 'warning', text });
    } else if (msg.method === 'Log.entryAdded' && msg.params && msg.params.entry && msg.params.entry.level === 'error') {
      const issue = { type: 'error', text: msg.params.entry.text || '' };
      if (!isIgnorablePageIssue(issue)) issues.push(issue);
    } else if (msg.method === 'Log.entryAdded' && msg.params && msg.params.entry && msg.params.entry.level === 'warning') {
      warnings.push({ type: 'warning', text: msg.params.entry.text || '' });
    }
  });
  return {
    errorIssues() {
      return issues.slice(0, 8);
    },
    warningIssues() {
      return warnings.slice(0, 12);
    },
  };
}

function isIgnorablePageIssue(issue) {
  const text = String(issue && issue.text || '').trim();
  return /^(?:THREE\.)+WebGLProgram: Shader Error (?:0|1282) - VALIDATE_STATUS false/.test(text)
    && /Program Info Log:\s*$/.test(text);
}

async function captureScreenshot(cdp, file) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
}

async function collectBrowserIdentity(cdp) {
  const version = await cdp.send('Browser.getVersion');
  const webgl = await evalJson(cdp, `(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!context) return { available: false, vendor: null, renderer: null };
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    const maskedVendor = String(context.getParameter(context.VENDOR) || '');
    const maskedRenderer = String(context.getParameter(context.RENDERER) || '');
    return {
      available: true,
      debugExtensionAvailable: !!debug,
      vendor: debug ? String(context.getParameter(debug.UNMASKED_VENDOR_WEBGL) || '') : maskedVendor,
      renderer: debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '') : maskedRenderer,
      maskedVendor,
      maskedRenderer,
    };
  })()`);
  return {
    product: version.product || null,
    userAgent: version.userAgent || null,
    jsVersion: version.jsVersion || null,
    protocolVersion: version.protocolVersion || null,
    webgl,
  };
}

function writeJsonReport(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeTextReport(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value, 'utf8');
}

async function waitFor(cdp, predicate, timeoutMs, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await predicate(cdp);
    if (last === true || (last && last.ready !== false)) return last;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${label}; last=${JSON.stringify(last)}`);
}

async function evalVoid(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(describeException(result.exceptionDetails));
}

async function evalJson(cdp, expression) {
  const wrapped = `Promise.resolve(${expression}).then((value) => JSON.stringify(value))`;
  const result = await cdp.send('Runtime.evaluate', {
    expression: wrapped,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(describeException(result.exceptionDetails));
  return JSON.parse(result.result && result.result.value || '{}');
}

function describeException(details) {
  return details && (details.exception && details.exception.description || details.text) || 'Runtime.evaluate failed';
}

async function startFreshServer() {
  const port = await findFreePort(8521);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, child, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await sleep(250);
  }
  child.kill();
  throw new Error(`Dev server did not become reachable at ${url}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 200; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free local port found starting at ${start}`);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}

function spawnChrome(debugPort) {
  const chromePath = findChrome();
  return spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--remote-debugging-port=${debugPort}`,
    'about:blank',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Chrome or Edge executable not found for authored asset live probe');
  return found;
}

async function connectCdp(debugPort) {
  let wsUrl = null;
  for (let i = 0; i < 80; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = tabs.find((tab) => tab.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch (_) {}
    await sleep(150);
  }
  assert.ok(wsUrl, 'no Chrome DevTools Protocol page target found');

  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
    for (const listener of listeners) listener(msg);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result || {});
    }
  });

  return {
    ws: socket,
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

function withDebugFlight(url) {
  const u = new URL(url);
  u.searchParams.set('debug', 'flight');
  return String(u);
}

async function closeWebSocket(socket) {
  if (!socket) return;
  try {
    if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) return;
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1000);
      socket.addEventListener('close', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      socket.close();
    });
  } catch (_) {}
}

async function terminateChild(child) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  if (process.platform === 'win32' && child.pid) {
    try {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch (_) {}
    await waitForChildExit(child, 2500);
    return;
  }
  try { child.kill(); } catch (_) {}
  await waitForChildExit(child, 2500);
  if (child.exitCode != null || child.signalCode != null) return;
  try { child.kill('SIGKILL'); } catch (_) {}
  await waitForChildExit(child, 1000);
}

async function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(timeoutMs),
  ]);
}

function summarizeShip(ship) {
  return {
    id: ship.id,
    defId: ship.defId,
    scenarioActorId: ship.scenarioActorId,
    state: ship.state,
    requiredSlotMode: ship.requiredSlotMode,
    slots: ship.slots,
    wholeShipBodyUrls: ship.wholeShipBodyUrls,
    fallbackParts: ship.fallbackParts,
    partObjectCount: ship.partObjectCount,
    instanceProxyCount: ship.instanceProxyCount,
    staticBatchCount: ship.staticBatchCount,
    authoredBodyProof: ship.authoredBodyProof,
  };
}

function compactStartupFailure(report, startupTrace, cause) {
  const loader = report && report.loaderDiagnostics || {};
  return {
    cause: cause && cause.message ? cause.message : String(cause),
    mode: report && report.mode || null,
    tick: report && report.tick || 0,
    shipCount: report && report.shipCount || 0,
    authoredShipCount: report && report.authoredShipCount || 0,
    player: report && report.player ? summarizeShip(report.player) : null,
    loaderDiagnostics: {
      available: loader.available,
      release: loader.release,
      partRoot: loader.partRoot,
      declaredCount: loader.declaredCount,
      loadedCount: loader.loadedCount,
      failureCount: loader.failureCount,
      wholeShipFailureCount: loader.wholeShipFailureCount,
      failures: Array.isArray(loader.failures) ? loader.failures.slice(0, 6) : [],
      error: loader.error,
    },
    startupTrace: Array.isArray(startupTrace) ? startupTrace.slice(-12) : [],
    reportError: report && report.error || undefined,
  };
}

function readPositiveIntArg(name, fallback) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!direct) return fallback;
  const value = Number.parseInt(direct.slice(name.length + 1), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
