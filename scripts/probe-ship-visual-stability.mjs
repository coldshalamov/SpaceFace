import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { finalizeVisualProbeResources } from './lib/visualProbeCleanup.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_FRAMES = 360;
const DEFAULT_WARMUP_FRAMES = 45;
const DEFAULT_MIN_INSPECTED_FRAMES = 300;
// A boundary's `compiling-pipelines` span covers its authored-admission queue position, a
// present-sliced pipeline compile and sliced residency uploads — and, for a non-urgent commit, the
// first-flight publication hold that releases at sim-time 20 s. The authored queue admits one
// entity per presented frame and drains ~one compile batch per present, so a ship near the tail of
// the opening cohort can legitimately need far more than the default 360-frame window on any
// contended host (an order of magnitude more on the KHR-less serial route, where every unit also
// pays a synchronous gl.finish() drain). The extension below only runs while a relevant ship is
// still unresolved, and the verdict is unchanged — still pending at the cap is a real
// never-resolved failure, not a truncated measurement.
const DEFAULT_RESOLVE_FRAME_CAP = 1800;
// 2026-09-30: 240s expired mid-drain on software-GL runners — serial shader compilation only
// frees one admission per presented frame, so queued ships (a Pelican observed pending at the
// cap) never resolved before the deadline though the same composition resolves in seconds on a
// real GPU. 360s covers the drained queue with headroom; the verdict itself is unchanged.
const DEFAULT_RESOLVE_MS = 360_000;
const DEFAULT_PENDING_GRACE_FRAMES = 120;
const RESOLVE_EXTENSION_TICK_MS = 250;
const PLAYER_LOD_SETTLE_FRAMES = 30;
const PLAYER_READABLE_SCREEN_RADIUS_PX = 80;
const PLAYER_MIN_VISIBLE_AUTHORED_SURFACES = 8;
// V5 carries 17 semantic materials and 33 texture bindings, then consolidates them into five
// stable LOD0 authored draw surfaces. Keep the modular floor at eight while requiring every one
// of those production whole-ship surfaces to remain visible.
const PLAYER_WHOLE_SHIP_MIN_VISIBLE_AUTHORED_SURFACES = 5;
const AUTHORED_BODY_PROOF = Object.freeze({
  minSurfaceCount: 1,
  minRadiusRatio: 0.20,
  minDiagonalRatio: 0.50,
  minBodyToReadabilityDiagonalRatio: 0.35,
  minPlayerScreenRadiusPx: 18,
});
const DEFAULT_FLIGHT_START_TIMEOUT_MS = 90000;
const WIDTH = readIntArg('--width', 1440);
const HEIGHT = readIntArg('--height', 900);
const FRAME_COUNT = readIntArg('--frames', Number(process.env.SF_VISUAL_STABILITY_FRAMES) || DEFAULT_FRAMES);
const WARMUP_FRAMES = Math.min(readIntArg('--warmup-frames', DEFAULT_WARMUP_FRAMES), Math.max(0, FRAME_COUNT - 1));
const RESOLVE_FRAME_CAP = readIntArg('--resolve-frames',
  Number(process.env.SF_VISUAL_STABILITY_RESOLVE_FRAMES) || DEFAULT_RESOLVE_FRAME_CAP);
const RESOLVE_MS = readIntArg('--resolve-ms',
  Number(process.env.SF_VISUAL_STABILITY_RESOLVE_MS) || DEFAULT_RESOLVE_MS);
const PENDING_GRACE_FRAMES = readIntArg('--pending-grace',
  Number(process.env.SF_VISUAL_STABILITY_GRACE_FRAMES) || DEFAULT_PENDING_GRACE_FRAMES);
const SF_BOOT_TIMEOUT_MS = readIntArg('--boot-timeout', Number(process.env.SF_VISUAL_STABILITY_BOOT_MS) || 90000);
const FLIGHT_START_TIMEOUT_MS = readIntArg('--flight-timeout',
  Number(process.env.SF_VISUAL_STABILITY_FLIGHT_MS) || DEFAULT_FLIGHT_START_TIMEOUT_MS);

const { chromium } = await loadPlaywright();
let server = null;
let browser = null;
let probeError = null;

try {
  const requestedBaseUrl = process.env.SF_PROBE_URL || '';
  server = await acquireVisualProbeServer({ explicitUrl: requestedBaseUrl, root: ROOT });
  browser = await launchProbeBrowser();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const pageIssues = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  // domcontentloaded is the whole deferred module graph — the first leg of the same boot phase
  // SF_BOOT_TIMEOUT_MS already budgets. The implicit 30 s nav default dies there on a contended
  // host before the boot wait can even start (the CI failure this prevents is indistinguishable
  // from a boot hang, which is exactly what the boot budget is for).
  await page.goto(withDebugFlight(server.baseUrl), { waitUntil: 'domcontentloaded', timeout: SF_BOOT_TIMEOUT_MS });
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
    pendingGraceFrames: PENDING_GRACE_FRAMES,
    resolveFrameCap: RESOLVE_FRAME_CAP,
    resolveMs: RESOLVE_MS,
    resolveExtensionTickMs: RESOLVE_EXTENSION_TICK_MS,
    playerLodSettleFrames: PLAYER_LOD_SETTLE_FRAMES,
    playerReadableScreenRadiusPx: PLAYER_READABLE_SCREEN_RADIUS_PX,
    playerMinVisibleAuthoredSurfaces: PLAYER_MIN_VISIBLE_AUTHORED_SURFACES,
    playerWholeShipMinVisibleAuthoredSurfaces: PLAYER_WHOLE_SHIP_MIN_VISIBLE_AUTHORED_SURFACES,
    authoredBodyProof: AUTHORED_BODY_PROOF,
  });
  const errorIssues = pageIssues.errorIssues();
  const ok = stability.failures.length === 0 && errorIssues.length === 0;
  console.log(JSON.stringify({
    ok,
    baseUrl: server.baseUrl,
    viewport: { width: WIDTH, height: HEIGHT },
    frames: FRAME_COUNT,
    warmupFrames: WARMUP_FRAMES,
    resolveFrameCap: RESOLVE_FRAME_CAP,
    resolveMs: RESOLVE_MS,
    pendingGraceFrames: PENDING_GRACE_FRAMES,
    stability,
    pageErrors: summarizeIssues(errorIssues),
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (error) {
  probeError = error;
} finally {
  await finalizeVisualProbeResources({ browser, server, primaryError: probeError });
}

async function sampleVisualStability(page, options) {
  return page.evaluate(async ({
    frames,
    warmupFrames,
    minInspectedFrames,
    pendingGraceFrames,
    resolveFrameCap,
    resolveMs,
    resolveExtensionTickMs,
    playerLodSettleFrames,
    playerReadableScreenRadiusPx,
    playerMinVisibleAuthoredSurfaces,
    playerWholeShipMinVisibleAuthoredSurfaces,
    authoredBodyProof,
  }) => {
    const failures = [];
    const tracks = new Map();
    const plannedInspectedFrames = Math.max(0, frames - warmupFrames);
    let inspectedFrameCount = 0;
    let maxShipCount = 0;
    let finalShips = [];
    const wallNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now());

    // Record which pipeline-compile route this context took — the same check the renderer's own
    // queue pacer (makeGpuQueuePacer) makes. No KHR_parallel_shader_compile means every admission
    // unit pays a presented-frame wait plus a synchronous gl.finish() drain: diagnostic context for
    // how long `compiling-pipelines` legitimately spans on this host, not a verdict input.
    const bootRender = (window.SF && window.SF.state && window.SF.state.render) || null;
    const bootRenderer = bootRender && bootRender.renderer || null;
    let serialCompileRoute = !!(bootRender && bootRender.gpu
      && (bootRender.gpu.software === true || bootRender.gpu.tier === 'software'));
    if (!serialCompileRoute) {
      try {
        let parallel = bootRenderer && bootRenderer.extensions
          && typeof bootRenderer.extensions.get === 'function'
          ? bootRenderer.extensions.get('KHR_parallel_shader_compile')
          : null;
        if (!parallel) {
          const gl = bootRenderer && typeof bootRenderer.getContext === 'function'
            ? bootRenderer.getContext()
            : null;
          parallel = gl && typeof gl.getExtension === 'function'
            ? gl.getExtension('KHR_parallel_shader_compile')
            : null;
        }
        serialCompileRoute = !parallel;
      } catch (_) {
        serialCompileRoute = true;
      }
    }

    // Pending-admission boundaries present the ship's designed low-detail stand-in (GFX-12)
    // while its authored body lands — a placeholder, not the authored identity the asserts below
    // prove. Whether a pending ship should resolve inside this window is the renderer's own
    // policy question: isEntityAuthoredUpgradeRelevant is the same gate canRequestAuthoredUpgrade
    // applies, so a ship beyond the approach runway reads as deferred-by-design instead of
    // failing an assert it can never satisfy, while a relevant ship stuck pending still fails
    // at the end of the window.
    let isAuthoredPendingStatus = (status) =>
      status === 'awaiting-authored-admission' || status === 'loading' || status === 'compiling-pipelines';
    let isEntityAuthoredUpgradeRelevant = null;
    let isEntityRenderRelevant = null;
    try {
      const [rendererModule, meshVisibilityModule] = await Promise.all([
        import('./src/render/renderer.js'),
        import('./src/render/entityMeshVisibility.js'),
      ]);
      if (typeof rendererModule.isEntityAuthoredUpgradeRelevant === 'function') {
        isEntityAuthoredUpgradeRelevant = rendererModule.isEntityAuthoredUpgradeRelevant;
      }
      if (typeof rendererModule.isEntityRenderRelevant === 'function') {
        isEntityRenderRelevant = rendererModule.isEntityRenderRelevant;
      }
      if (typeof meshVisibilityModule.isAuthoredPendingStatus === 'function') {
        isAuthoredPendingStatus = meshVisibilityModule.isAuthoredPendingStatus;
      }
    } catch (_) {}
    // Frames a ship may sit upgrade-relevant and still pending before it counts as stuck. A
    // relevant admission job is designed to finish in seconds, not across a full window.
    if (plannedInspectedFrames < minInspectedFrames) {
      failures.push({
        frame: null,
        reason: 'insufficient-inspected-frames',
        detail: { inspectedFrameCount: plannedInspectedFrames, minInspectedFrames },
        ship: null,
      });
    }

    const sampleFrame = (frame) => {
      const ships = captureShips(frame);
      maxShipCount = Math.max(maxShipCount, ships.length);
      finalShips = ships;
      if (frame >= warmupFrames) inspectFrame(frame, ships);
    };

    // A tracked ship the renderer's own policy still owes a resolution for — pending-and-upgrade-
    // relevant or meshless-and-render-relevant. The two-frame recency bound ignores tracks whose
    // entity has left the census entirely; there is nothing left to wait on for those.
    const hasUnresolvedRelevantTrack = (frame) => {
      for (const track of tracks.values()) {
        if (track.sawTerminal !== false) continue;
        if ((track.relevantPendingFrames + track.meshlessRelevantFrames) <= 0) continue;
        if (track.lastFrame < frame - 2) continue;
        return true;
      }
      return false;
    };

    let frame = 0;
    for (; frame < frames; frame++) {
      sampleFrame(frame);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    // Resolution extension: while any relevant ship is still unresolved, keep sampling up to the
    // resolve cap. Each presented frame is the currency the authored admission queue drains in
    // (one entity admission plus one compile batch per present, with bounded task resumes between),
    // so on a contended host the default window ends before a queued ship's turn — the CI failure
    // this prevents measured boot pacing, not resolution. The tick races a short task fallback
    // because every admission wait in the chain already resumes on its own unstick timer when rAF
    // starves; the wall cap bounds the wait regardless. A ship still unresolved at the cap fails
    // the same verdict below — this only gives a queued ship its real chance to resolve.
    const frameCap = Math.max(frames, Number(resolveFrameCap) || 0);
    const resolveDeadlineMs = wallNow() + Math.max(0, Number(resolveMs) || 0);
    while (frame < frameCap
        && wallNow() < resolveDeadlineMs
        && hasUnresolvedRelevantTrack(frame)) {
      sampleFrame(frame);
      frame++;
      await new Promise((resolve) => {
        let fired = false;
        const fire = () => {
          if (fired) return;
          fired = true;
          resolve();
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fire);
        setTimeout(fire, Math.max(1, Number(resolveExtensionTickMs) || 250));
      });
    }
    inspectedFrameCount = Math.max(0, frame - warmupFrames);
    // The grace is measured against the window actually inspected: a ship must resolve within the
    // frame budget the route's admission cost can honestly fit inside.
    const graceSource = Number.isFinite(Number(pendingGraceFrames)) ? Number(pendingGraceFrames) : 120;
    const pendingRelevantGraceFrames = Math.min(graceSource, Math.max(1, inspectedFrameCount - 1));
    inspectFinalPlayer(finalShips, Math.max(0, frame - 1));
    for (const track of tracks.values()) {
      if (track.sawTerminal !== false) continue;
      const unresolvedRelevantFrames = track.relevantPendingFrames + track.meshlessRelevantFrames;
      if (unresolvedRelevantFrames <= pendingRelevantGraceFrames) continue;
      fail(track.lastFrame, track.lastShip, 'ship-never-resolved-past-window', {
        authoredState: track.lastAuthoredState,
        relevantPendingFrames: track.relevantPendingFrames,
        meshlessRelevantFrames: track.meshlessRelevantFrames,
        deferredPendingFrames: track.deferredPendingFrames,
        graceFrames: pendingRelevantGraceFrames,
        frameCap,
      });
    }

    return {
      ok: failures.length === 0,
      frameCount: frames,
      sampledFrameCount: frame,
      warmupFrames,
      inspectedFrameCount,
      serialCompileRoute,
      frameCap,
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
        // Admission boundaries deliberately exist before their GLB is decoded, but contain zero
        // renderable surfaces. They are not a visual identity and cannot flicker or swap on screen.
        // Begin stability tracking only when the entity is in the camera runway or has actually
        // published pixels; once that happens, every authored/root/LOD invariant below is strict.
        // A ship the residency policy has not mounted owes no pixels — even when its sim
        // position happens to project onto the glass. Meshless-while-render-relevant and
        // pending-admission are both designed unresolved states (nothing / the stand-in draws;
        // there is no authored identity to flicker or swap). Count them per frame and let the
        // window-end check enforce that relevant ships actually resolve.
        if (!ship.meshExists && ship.renderRelevant === false) continue;
        if (!ship.inView && ship.visibleRenderableCount <= 0) continue;
        const key = trackKey(ship);
        let track = tracks.get(key);

        if (!ship.meshExists || isAuthoredPendingStatus(ship.authoredState)) {
          if (track && track.sawTerminal) {
            // A published authored identity regressing to pending or losing its mesh is the
            // swap/flicker class this probe exists to catch — not a designed transition. Mark
            // the track unresolved again so the slip reports once here instead of every frame,
            // and so a ship that never recovers still lands in the window-end check.
            fail(frame, ship, 'authored-state-regressed-to-pending', {
              was: track.lastAuthoredState,
              now: ship.meshExists ? ship.authoredState : 'missing',
            });
            track.sawTerminal = false;
          }
          if (!track) {
            track = makeTrack(ship, frame, false);
            tracks.set(key, track);
          }
          noteTrack(track, ship);
          track.lastFrame = frame;
          track.lastShip = ship;
          track.lastAuthoredState = ship.authoredState;
          if (!ship.meshExists) track.meshlessRelevantFrames++;
          else if (ship.upgradeRelevant) track.relevantPendingFrames++;
          else track.deferredPendingFrames++;
          continue;
        }
        if (!track) {
          track = makeTrack(ship, frame, true);
          tracks.set(key, track);
        }
        if (track.sawTerminal === false) {
          // First terminal sighting after the pending stand-in: the pending→authored commit is
          // the designed upgrade swap, so the identity baseline forms here rather than firing
          // every "-changed-after-warmup" assert on the stand-in's placeholder counts.
          rebaseTrackIdentity(track, ship);
          track.sawTerminal = true;
        }
        track.lastFrame = frame;
        track.lastShip = ship;
        track.lastAuthoredState = ship.authoredState;

        if (ship.meshExists !== track.meshExists) {
          fail(frame, ship, 'mesh-existence-changed-after-warmup', { was: track.meshExists, now: ship.meshExists });
        }
        if (ship.rootUuid && track.rootUuid && ship.rootUuid !== track.rootUuid) {
          fail(frame, ship, 'mesh-root-changed', { was: track.rootUuid, now: ship.rootUuid });
        }
        if (ship.authoredState !== track.authoredState) {
          fail(frame, ship, 'authored-state-changed-after-warmup', { was: track.authoredState, now: ship.authoredState });
        }
        if (ship.lodLevel !== track.lodLevel) {
          if (ship.inView) {
            track.lodTransitionFrames.push(frame);
            const recentTransitions = track.lodTransitionFrames.filter((entry) => entry >= frame - 60);
            if (recentTransitions.length > 2) {
              fail(frame, ship, 'visible-lod-thrashing', {
                was: track.lodLevel,
                now: ship.lodLevel,
                recentTransitionFrames: recentTransitions,
              });
            }
          }
          // A single distance-driven LOD transition is expected — and a designed whole-ship
          // level swap presents a different authored root under the same boundary: mesh,
          // authored-surface, batch, and composition counts legitimately differ per level.
          // Rebase them together with the level so the churn asserts below still fire only
          // when a root mutates within a level (the flicker class), not on the designed swap.
          track.lodLevel = ship.lodLevel;
          track.meshCount = ship.meshCount;
          track.authoredSurfaceCount = ship.authoredSurfaceCount;
          track.authoredBodySurfaceCount = ship.authoredBodySurfaceCount;
          track.staticBatchCount = ship.staticBatchCount;
          track.instanceProxyCount = ship.instanceProxyCount;
          track.compositionId = ship.compositionId;
          track.slotsKey = ship.slotsKey;
        }
        // A live render-package pool promotion or restore flips a mesh's draw path in place
        // (promoteRenderPackageMeshToPoolProxy / restoreDirectPackageMesh): the node keeps its
        // geometry, part tags and visibility while isMesh and the spacefaceInstanceProxy flag
        // trade — one designed mount-path event, not authored churn. Its arithmetic signature is
        // exact: every mesh count lost became a proxy (or back) in the same frame, and the
        // surface/batch counters move only by the converted meshes' own flags — same direction as
        // the mesh delta, bounded by its magnitude. Rebase the mount-shape baselines on that
        // signature — the same designed-transition class as the whole-ship level swap above — so
        // a deferred pool publish landing mid-window does not report as churn on every remaining
        // frame. Identity counters (rootUuid, composition, slots, authoredState) are untouched and
        // still assert below; a mesh added or lost outside a proxy conversion still fails.
        {
          const meshDelta = ship.meshCount - track.meshCount;
          const proxyDelta = ship.instanceProxyCount - track.instanceProxyCount;
          const withinSwap = (before, after) => {
            const delta = after - before;
            return delta === 0
              || (Math.sign(delta) === Math.sign(meshDelta) && Math.abs(delta) <= Math.abs(meshDelta));
          };
          if (meshDelta !== 0 && proxyDelta === -meshDelta
            && withinSwap(track.authoredSurfaceCount, ship.authoredSurfaceCount)
            && withinSwap(track.authoredBodySurfaceCount, ship.authoredBodySurfaceCount)
            && withinSwap(track.staticBatchCount, ship.staticBatchCount)) {
            track.meshCount = ship.meshCount;
            track.authoredSurfaceCount = ship.authoredSurfaceCount;
            track.authoredBodySurfaceCount = ship.authoredBodySurfaceCount;
            track.staticBatchCount = ship.staticBatchCount;
            track.instanceProxyCount = ship.instanceProxyCount;
          }
        }
        if (ship.compositionId !== track.compositionId) {
          fail(frame, ship, 'composition-changed-after-warmup', { was: track.compositionId, now: ship.compositionId });
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
        if (ship.authoredBodySurfaceCount !== track.authoredBodySurfaceCount) {
          fail(frame, ship, 'authored-body-surface-count-changed-after-warmup', { was: track.authoredBodySurfaceCount, now: ship.authoredBodySurfaceCount });
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
        if (ship.authoredBodySurfaceCount < authoredBodyProof.minSurfaceCount) {
          fail(frame, ship, 'ship-missing-authored-body-surface', {
            authoredBodySurfaceCount: ship.authoredBodySurfaceCount,
            minimum: authoredBodyProof.minSurfaceCount,
          });
        }
        if (ship.visibleAuthoredBodySurfaceCount < authoredBodyProof.minSurfaceCount) {
          fail(frame, ship, 'ship-missing-visible-authored-body-surface', {
            visibleAuthoredBodySurfaceCount: ship.visibleAuthoredBodySurfaceCount,
            minimum: authoredBodyProof.minSurfaceCount,
          });
        }
        if (ship.entityRadius > 0 && ship.authoredBodyRadiusRatio < authoredBodyProof.minRadiusRatio) {
          fail(frame, ship, 'ship-authored-body-radius-too-small', {
            authoredBodyRadiusRatio: ship.authoredBodyRadiusRatio,
            minimum: authoredBodyProof.minRadiusRatio,
          });
        }
        if (ship.entityRadius > 0 && ship.authoredBodyDiagonalRatio < authoredBodyProof.minDiagonalRatio) {
          fail(frame, ship, 'ship-authored-body-bounds-too-small', {
            authoredBodyDiagonalRatio: ship.authoredBodyDiagonalRatio,
            minimum: authoredBodyProof.minDiagonalRatio,
          });
        }
        if (ship.readabilityCoreSurfaceCount > 0
          && ship.authoredBodyToReadabilityDiagonalRatio < authoredBodyProof.minBodyToReadabilityDiagonalRatio) {
          fail(frame, ship, 'ship-readability-shell-carrying-silhouette', {
            authoredBodyToReadabilityDiagonalRatio: ship.authoredBodyToReadabilityDiagonalRatio,
            minimum: authoredBodyProof.minBodyToReadabilityDiagonalRatio,
          });
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
        const playerSurfaceMinimum = ship.wholeShip
          ? playerWholeShipMinVisibleAuthoredSurfaces
          : playerMinVisibleAuthoredSurfaces;
        if (ship.isPlayer && ship.inView && frame >= warmupFrames + playerLodSettleFrames
          && ship.screenRadiusPx >= playerReadableScreenRadiusPx
          && ship.visibleAuthoredSurfaceCount < playerSurfaceMinimum) {
          fail(frame, ship, 'player-readable-ship-too-few-visible-authored-surfaces', {
            visibleAuthoredSurfaceCount: ship.visibleAuthoredSurfaceCount,
            minimum: playerSurfaceMinimum,
            wholeShip: ship.wholeShip,
          });
        }
        if (ship.isPlayer && ship.inView && frame >= warmupFrames + playerLodSettleFrames
          && ship.screenRadiusPx >= playerReadableScreenRadiusPx
          && ship.authoredBodyScreenRadiusPx < authoredBodyProof.minPlayerScreenRadiusPx) {
          fail(frame, ship, 'player-readable-authored-body-screen-occupancy-too-small', {
            authoredBodyScreenRadiusPx: ship.authoredBodyScreenRadiusPx,
            minimum: authoredBodyProof.minPlayerScreenRadiusPx,
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
      const playerSurfaceMinimum = player.wholeShip
        ? playerWholeShipMinVisibleAuthoredSurfaces
        : playerMinVisibleAuthoredSurfaces;
      if (player.visibleAuthoredSurfaceCount < playerSurfaceMinimum) {
        fail(frame, player, 'final-player-readable-ship-too-few-visible-authored-surfaces', {
          visibleAuthoredSurfaceCount: player.visibleAuthoredSurfaceCount,
          minimum: playerSurfaceMinimum,
          wholeShip: player.wholeShip,
        });
      }
      if (player.authoredBodyScreenRadiusPx < authoredBodyProof.minPlayerScreenRadiusPx) {
        fail(frame, player, 'final-player-readable-authored-body-screen-occupancy-too-small', {
          authoredBodyScreenRadiusPx: player.authoredBodyScreenRadiusPx,
          minimum: authoredBodyProof.minPlayerScreenRadiusPx,
        });
      }
    }

    function makeTrack(ship, frame, sawTerminal) {
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
        authoredBodySurfaceCount: ship.authoredBodySurfaceCount,
        staticBatchCount: ship.staticBatchCount,
        instanceProxyCount: ship.instanceProxyCount,
        lodTransitionFrames: [],
        framesSeen: 0,
        inViewFrames: 0,
        missingMeshFrames: 0,
        sawTerminal: sawTerminal === undefined ? !isAuthoredPendingStatus(ship.authoredState) : sawTerminal,
        relevantPendingFrames: 0,
        meshlessRelevantFrames: 0,
        deferredPendingFrames: 0,
        lastFrame: frame,
        lastShip: ship,
        lastAuthoredState: ship.authoredState,
        rootUuids: new Set(),
        authoredStates: new Set(),
        compositionIds: new Set(),
        lodLevels: new Set(),
        meshCounts: new Set(),
        authoredBodySurfaceCounts: new Set(),
        staticBatchCounts: new Set(),
      };
    }

    // The pending stand-in shares the boundary root but not the authored identity. When the
    // body commits, re-seed every identity baseline so the designed swap is not reported as
    // composition/LOD/surface churn.
    function rebaseTrackIdentity(track, ship) {
      track.rootUuid = ship.rootUuid;
      track.meshExists = ship.meshExists;
      track.authoredState = ship.authoredState;
      track.authoredMode = ship.authoredMode;
      track.compositionId = ship.compositionId;
      track.slotsKey = ship.slotsKey;
      track.lodLevel = ship.lodLevel;
      track.meshCount = ship.meshCount;
      track.authoredSurfaceCount = ship.authoredSurfaceCount;
      track.authoredBodySurfaceCount = ship.authoredBodySurfaceCount;
      track.staticBatchCount = ship.staticBatchCount;
      track.instanceProxyCount = ship.instanceProxyCount;
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
      track.authoredBodySurfaceCounts.add(String(ship.authoredBodySurfaceCount));
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
        .map((entity) => inspectShip(entity, frame, camera, viewport, playerId, state))
        .filter(Boolean);
    }

    function inspectShip(entity, frame, camera, viewport, playerId, state) {
      const root = entity.mesh || (entity.view && entity.view.root) || null;
      if (!root || !root.userData) {
        const projectedFallback = projectEntityPosition(entity, camera);
        // Whether the residency policy owes this entity a mesh at all. Fail closed (relevant)
        // when the policy import failed so a genuinely missing mount still fails.
        let renderRelevant = null;
        try {
          renderRelevant = isEntityRenderRelevant ? !!isEntityRenderRelevant(entity, state) : true;
        } catch (_) {
          renderRelevant = true;
        }
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
          upgradeRelevant: null,
          renderRelevant,
          compositionId: null,
          slotsKey: '{}',
          lodLevel: null,
          inView: projectedFallback.inView,
          screenRadiusPx: 0,
          meshCount: 0,
          visibleRenderableCount: 0,
          authoredSurfaceCount: 0,
          visibleAuthoredSurfaceCount: 0,
          authoredBodySurfaceCount: 0,
          visibleAuthoredBodySurfaceCount: 0,
          authoredBodyTriangleCount: 0,
          authoredBodyMaxWorldPrimitiveRadius: 0,
          authoredBodyRadiusRatio: 0,
          authoredBodyDiagonalRatio: 0,
          authoredBodyScreenRadiusPx: 0,
          readabilityCoreSurfaceCount: 0,
          visibleReadabilityCoreSurfaceCount: 0,
          readabilityCoreMaxWorldPrimitiveRadius: 0,
          authoredBodyToReadabilityDiagonalRatio: 0,
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
      let authoredBodyScreenRadiusPx = 0;

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
      let authoredBodySurfaceCount = 0;
      let visibleAuthoredBodySurfaceCount = 0;
      let authoredBodyTriangleCount = 0;
      let authoredBodyMaxWorldPrimitiveRadius = 0;
      let readabilityCoreSurfaceCount = 0;
      let visibleReadabilityCoreSurfaceCount = 0;
      let readabilityCoreMaxWorldPrimitiveRadius = 0;
      let staticBatchCount = 0;
      let visibleStaticBatchCount = 0;
      let instanceProxyCount = 0;
      let boundsBad = false;
      let maxWorldPrimitiveRadius = 0;
      let firstHiddenAncestor = null;
      const largePrimitives = [];

      root.traverse((object) => {
        if (!object) return;
        if (object.userData && object.userData.spacefaceInstanceProxy) instanceProxyCount++;
        if (!object.isMesh) return;
        meshCount++;
        const materialVisible = materialIsVisible(object.material);
        const worldVisible = visibleThroughRoot(object, root);
        if (worldVisible && materialVisible) visibleRenderableCount++;
        if (!worldVisible && !firstHiddenAncestor) {
          const chain = [];
          for (let current = object; current && current !== root; current = current.parent) {
            if (current.visible === false) {
              chain.push({
                name: current.name || null,
                type: current.type || null,
                isMesh: !!current.isMesh,
                partUrl: current.userData && (current.userData.spacefacePartUrl
                  || (Array.isArray(current.userData.spacefacePartUrls) ? current.userData.spacefacePartUrls[0] : null)),
                lodTag: current.userData && current.userData.lod ? current.userData.lod.level : null,
                authoredReadableFallbackLayer: !!(current.userData && current.userData.authoredReadableFallbackLayer),
                authoredSuppressedByReadableFallback: !!(current.userData && current.userData.authoredSuppressedByReadableFallback),
                authoredReadableSilhouetteSuppressed: !!(current.userData && current.userData.authoredReadableSilhouetteSuppressed),
                rosterPrewarm: current.userData && current.userData.rosterPrewarm || null,
              });
            }
          }
          if (root.visible === false) chain.push({ name: root.name || null, type: root.type || null, isRoot: true });
          firstHiddenAncestor = chain;
        }

        const isAuthoredSurface = !!(object.userData && (
          object.userData.spacefacePartUrl
          || object.userData.spacefaceStaticBatch
          || object.userData.spacefacePartUrls
        ));
        const partUrls = partUrlsForObject(object);
        const isReadabilityCore = !!(object.userData && object.userData.spacefaceReadabilityCore)
          || partUrls.some((url) => String(url || '').includes('readability/'));
        const isAuthoredBodySurface = partUrls.some(isAuthoredBodyUrl) && !isReadabilityCore;
        const radius = worldPrimitiveRadius(object, scale);
        if (!Number.isFinite(radius)) {
          boundsBad = true;
          return;
        }
        if (isAuthoredSurface) authoredSurfaceCount++;
        if (isAuthoredSurface && worldVisible && materialVisible) visibleAuthoredSurfaceCount++;
        if (isAuthoredBodySurface) {
          authoredBodySurfaceCount++;
          authoredBodyTriangleCount += triangleCount(object.geometry);
          if (radius > authoredBodyMaxWorldPrimitiveRadius) authoredBodyMaxWorldPrimitiveRadius = radius;
          if (worldVisible && materialVisible) visibleAuthoredBodySurfaceCount++;
        }
        if (isReadabilityCore) {
          readabilityCoreSurfaceCount++;
          if (radius > readabilityCoreMaxWorldPrimitiveRadius) readabilityCoreMaxWorldPrimitiveRadius = radius;
          if (worldVisible && materialVisible) visibleReadabilityCoreSurfaceCount++;
        }
        if (object.userData && object.userData.spacefaceStaticBatch) {
          staticBatchCount++;
          if (worldVisible && materialVisible) visibleStaticBatchCount++;
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
      if (camera && center && projected && offset && authoredBodyMaxWorldPrimitiveRadius > 0) {
        try {
          offset.set(center.x + authoredBodyMaxWorldPrimitiveRadius, center.y, center.z).project(camera);
          if (Number.isFinite(offset.x)) {
            authoredBodyScreenRadiusPx = Math.abs(offset.x - projected.x) * viewport.width * 0.5;
          }
        } catch (_) {
          boundsBad = true;
        }
      }

      const authoredState = data.authoredAssetState || 'unknown';
      // Only pending ships need the answer; fail closed (relevant) if the policy import failed.
      let upgradeRelevant = null;
      if (isAuthoredPendingStatus(authoredState)) {
        try {
          upgradeRelevant = isEntityAuthoredUpgradeRelevant
            ? !!isEntityAuthoredUpgradeRelevant(entity, state)
            : true;
        } catch (_) {
          upgradeRelevant = true;
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
        authoredState,
        authoredMode: data.authoredAssetMode || null,
        upgradeRelevant,
        renderRelevant: null,
        wholeShip: Object.values(data.authoredSlots || {}).flat()
          .some((url) => String(url || '').includes('/wholeships/')),
        compositionId: data.authoredCompositionId || null,
        slotsKey: stableSlotKey(data.authoredSlots),
        // A whole-ship LOD request stamps boundary.userData.lod.level synchronously, but the
        // family controller only mounts the demoted root after its async decode + pipeline
        // compile/upload finishes — swapTo stamps wholeShipLodActiveLevel atomically with the
        // child add/remove. On contended machines that gap spans many frames: rebasing on the
        // request level would capture the still-mounted old level's counts, so the real mount
        // then reads as a within-level mutation every remaining frame. The mounted-level stamp
        // flips in the same synchronous swap as the geometry the counts measure, so a level
        // change observed here always coincides with the change in children. Boundaries without
        // the family controller (the player, per-part LOD ships) keep the resolver level.
        lodLevel: data.wholeShipLodActiveLevel || (data.lod && data.lod.level) || null,
        requestedLodLevel: data.lod && data.lod.level || null,
        inView,
        screenRadiusPx,
        meshCount,
        visibleRenderableCount,
        firstHiddenAncestor,
        pipelinesPending: data.pipelinesPending === true,
        pipelinesPendingBy: data.pipelinesPendingBy || null,
        pipelinesPendingHolds: Number.isFinite(data.pipelinesPendingHolds) ? data.pipelinesPendingHolds : null,
        authoredPreparePhase: data.authoredPreparePhase || null,
        geometryPending: data.geometryPending === true,
        authoredUpgradePromiseActive: data.authoredUpgradePromise != null,
        authoredResolvingMarker: data.authoredResolvingMarker === true,
        presentationTier: entity && entity.activity && entity.activity.presentationTier || null,
        authoredSurfaceCount,
        visibleAuthoredSurfaceCount,
        authoredBodySurfaceCount,
        visibleAuthoredBodySurfaceCount,
        authoredBodyTriangleCount,
        authoredBodyMaxWorldPrimitiveRadius,
        authoredBodyRadiusRatio: roundFinite((Number(entity.radius) || 0) > 0
          ? authoredBodyMaxWorldPrimitiveRadius / (Number(entity.radius) || 1)
          : 0),
        authoredBodyDiagonalRatio: roundFinite((Number(entity.radius) || 0) > 0
          ? (authoredBodyMaxWorldPrimitiveRadius * 2) / (Number(entity.radius) || 1)
          : 0),
        authoredBodyScreenRadiusPx,
        readabilityCoreSurfaceCount,
        visibleReadabilityCoreSurfaceCount,
        readabilityCoreMaxWorldPrimitiveRadius,
        authoredBodyToReadabilityDiagonalRatio: roundFinite(readabilityCoreMaxWorldPrimitiveRadius > 0
          ? authoredBodyMaxWorldPrimitiveRadius / readabilityCoreMaxWorldPrimitiveRadius
          : (authoredBodyMaxWorldPrimitiveRadius > 0 ? Infinity : 0)),
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

    function partUrlsForObject(object) {
      if (!object || !object.userData) return [];
      if (Array.isArray(object.userData.spacefacePartUrls)) return object.userData.spacefacePartUrls.filter(Boolean);
      return object.userData.spacefacePartUrl ? [object.userData.spacefacePartUrl] : [];
    }

    function isAuthoredBodyUrl(url) {
      const text = String(url || '');
      return text.includes('/hulls/') || text.includes('/wholeships/') || text.includes('hero/kestrel');
    }

    function triangleCount(geometry) {
      if (!geometry) return 0;
      const index = typeof geometry.getIndex === 'function' ? geometry.getIndex() : geometry.index;
      if (index && Number.isFinite(index.count)) return Math.floor(index.count / 3);
      const position = geometry.getAttribute && geometry.getAttribute('position');
      return position && Number.isFinite(position.count) ? Math.floor(position.count / 3) : 0;
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
        upgradeRelevant: ship.upgradeRelevant,
        renderRelevant: ship.renderRelevant,
        wholeShip: ship.wholeShip,
        compositionId: ship.compositionId,
        lodLevel: ship.lodLevel,
        inView: ship.inView,
        meshCount: ship.meshCount,
        visibleRenderableCount: ship.visibleRenderableCount,
        firstHiddenAncestor: ship.firstHiddenAncestor || null,
        pipelinesPending: ship.pipelinesPending === true,
        pipelinesPendingBy: ship.pipelinesPendingBy || null,
        pipelinesPendingHolds: Number.isFinite(ship.pipelinesPendingHolds) ? ship.pipelinesPendingHolds : null,
        authoredPreparePhase: ship.authoredPreparePhase || null,
        geometryPending: ship.geometryPending === true,
        authoredUpgradePromiseActive: ship.authoredUpgradePromiseActive === true,
        authoredResolvingMarker: ship.authoredResolvingMarker === true,
        presentationTier: ship.presentationTier || null,
        authoredSurfaceCount: ship.authoredSurfaceCount,
        visibleAuthoredSurfaceCount: ship.visibleAuthoredSurfaceCount,
        authoredBodySurfaceCount: ship.authoredBodySurfaceCount,
        visibleAuthoredBodySurfaceCount: ship.visibleAuthoredBodySurfaceCount,
        authoredBodyTriangleCount: ship.authoredBodyTriangleCount,
        authoredBodyMaxWorldPrimitiveRadius: roundFinite(ship.authoredBodyMaxWorldPrimitiveRadius),
        authoredBodyRadiusRatio: roundFinite(ship.authoredBodyRadiusRatio),
        authoredBodyDiagonalRatio: roundFinite(ship.authoredBodyDiagonalRatio),
        authoredBodyScreenRadiusPx: roundFinite(ship.authoredBodyScreenRadiusPx),
        readabilityCoreSurfaceCount: ship.readabilityCoreSurfaceCount,
        visibleReadabilityCoreSurfaceCount: ship.visibleReadabilityCoreSurfaceCount,
        readabilityCoreMaxWorldPrimitiveRadius: roundFinite(ship.readabilityCoreMaxWorldPrimitiveRadius),
        authoredBodyToReadabilityDiagonalRatio: roundFinite(ship.authoredBodyToReadabilityDiagonalRatio),
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
        sawTerminal: track.sawTerminal,
        relevantPendingFrames: track.relevantPendingFrames,
        meshlessRelevantFrames: track.meshlessRelevantFrames,
        deferredPendingFrames: track.deferredPendingFrames,
        lastFrame: track.lastFrame,
        lastAuthoredState: track.lastAuthoredState,
        rootUuids: Array.from(track.rootUuids).sort(),
        authoredStates: Array.from(track.authoredStates).sort(),
        compositionIds: Array.from(track.compositionIds).sort(),
        lodLevels: Array.from(track.lodLevels).sort(),
        visibleLodTransitionFrames: [...track.lodTransitionFrames],
        meshCounts: Array.from(track.meshCounts).sort(),
        authoredBodySurfaceCounts: Array.from(track.authoredBodySurfaceCounts).sort(),
        staticBatchCounts: Array.from(track.staticBatchCounts).sort(),
      };
    }

    function roundFinite(value) {
      return Number.isFinite(value) ? Number(value.toFixed(3)) : value;
    }
  }, options);
}

async function collectStartupSnapshot(page, { includeLoaderDiagnostics = false } = {}) {
  try {
    return await page.evaluate(async (withLoaderDiagnostics) => {
      const sf = window.SF || null;
      const state = sf && sf.state || null;
      const render = state && state.render || null;
      // Entity presence is the authoritative map lookup — the same read the game's own
      // helpers.player() and the sibling authored-assets probe make. entityList is a maintained
      // mirror kept for the ship census diagnostics; a pending/meshless ship is still a real
      // entity (its admission boundary draws the GFX-12 stand-in) even before the authored hull
      // mounts.
      const player = state && state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(state.playerId)
        : null;
      const ships = state && Array.isArray(state.entityList)
        ? state.entityList.filter((entity) => entity && entity.type === 'ship').map((entity) => ({
          id: entity.id,
          defId: entity.data && entity.data.defId || null,
          alive: entity.alive !== false,
          meshState: entity.mesh && entity.mesh.userData && entity.mesh.userData.authoredAssetState || null,
          compositionId: entity.mesh && entity.mesh.userData && entity.mesh.userData.authoredCompositionId || null,
        }))
        : [];
      // One atomic sample: mode/tick/player/ships must all be read in the same synchronous block.
      // The old code read `ships` before the loader awaits and mode/playerId after them, so on a
      // starved host the single return value could straddle the whole transition — ships captured
      // inside the prepareRun clear window (`[]`), mode and playerId captured after flight began
      // (`flight`, `1`). That torn snapshot is what produced the impossible
      // {"mode":"flight","playerId":1,"ships":[]} CI report.
      const snapshot = {
        mode: state && state.mode || null,
        tick: state && state.tick || 0,
        timeScale: state && state.timeScale,
        playerId: state && state.playerId || null,
        entityCount: state && state.entities && typeof state.entities.size === 'number' ? state.entities.size : null,
        entityListLength: state && Array.isArray(state.entityList) ? state.entityList.length : null,
        shipCount: ships.length,
        playerPresent: !!player,
        playerAlive: player ? player.alive !== false : null,
        playerMeshState: player && player.mesh && player.mesh.userData
          ? (player.mesh.userData.authoredAssetState || null)
          : null,
        ships,
      };
      let loaderDiagnostics = null;
      // The contract scan is failure-report only. Every uncached optional load is a fetch+decode
      // admitted onto the same serial queue this probe is measuring; run it once at the end, not
      // every 150 ms poll.
      if (withLoaderDiagnostics) {
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
      }
      return { ...snapshot, loaderDiagnostics };
    }, includeLoaderDiagnostics);
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
    // Playable means the sim handed over flight control with a live player entity. The authored
    // hull mounts on the renderer's own paced admission queue and legitimately lands after mode
    // flips on a serial-GL host; the sampler below is what scores authored identity, under the
    // renderer's relevance policy (pending boundary = stand-in, not a failure). Requiring
    // `meshState === 'authored'` here measured boot pacing instead of flight stability — and on a
    // contended host it could never return while the admission queue was still draining.
    if (last && last.mode === 'flight' && last.playerId
      && last.playerPresent && last.playerAlive !== false) {
      return last;
    }
    await page.waitForTimeout(150);
  }
  // The heavy loader scan runs once here so the failure report still carries it.
  const diagnostics = await collectStartupSnapshot(page, { includeLoaderDiagnostics: true })
    .catch(() => null);
  throw new Error(`flight did not become playable before visual stability probe: ${JSON.stringify(diagnostics && !diagnostics.error ? diagnostics : last)}`);
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
