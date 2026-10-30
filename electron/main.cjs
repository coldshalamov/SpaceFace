// Electron desktop shell for SpaceFace (Steam-ready).
// Serves the app from a tiny in-process static server on a FIXED localhost port so ES modules +
// the importmap load exactly as they do in a browser, then opens a frameless game window.
//
// The HTTP core (MIME table, dev-freshness, static serving, containment check) lives in
// scripts/lib/gameServer.cjs and is SHARED with server.js so the two launchers can never drift.
// This file is the Electron-only shell: app lifecycle, single-instance lock, GPU switches,
// window creation, fixed-port-for-saves, packaged→bundle root selection.
// `npm run check:launch-policy` enforces that both launchers share that module.
const electron = require('electron');
const { app, BrowserWindow, ipcMain, powerMonitor, dialog, screen } = electron;
const path = require('path');
// Bytecode-cache the shell's own module graph under userData so launches after the first skip
// recompiling the main-process modules below. Isolated evidence keeps its cache inside the
// throwaway profile (its setPath override has not run yet). No-op where the host lacks support.
try {
  const compileCacheBase = process.env.SPACEFACE_ELECTRON_TEST_MODE === 'isolated-evidence'
    && process.env.SPACEFACE_ELECTRON_TEST_USER_DATA
    ? process.env.SPACEFACE_ELECTRON_TEST_USER_DATA
    : app.getPath('userData');
  require('node:module').enableCompileCache?.(path.join(compileCacheBase, 'v8-compile-cache'));
} catch {}
const fs = require('fs');
const { createGameServer } = require('../scripts/lib/gameServer.cjs');
const { resolveMountedUserContentDir } = require('../scripts/lib/userContentStore.cjs');
const {
  appendLaunchReceipt,
  isAllowedElectronListenerPort,
  isAssetPreloadFailureMessage,
  probeSpaceFacePort,
  resolveElectronLaunchConfig,
  resolveWebRoot,
} = require('../scripts/lib/electronLaunchProtocol.cjs');
const {
  LOCAL_STORAGE_DUMP_SOURCE,
  PLAYER_STORE_ORIGIN_ROUTE,
  resolvePlayerSaveDir,
  writePlayerStoreKeysSync,
} = require('../scripts/lib/playerSaveStore.cjs');
const { publicBuildInfo, resolveReleaseIdentity } = require('./releaseIdentity.cjs');
const {
  WINDOW_STATE_FILE,
  readWindowStateFile,
  sanitizeWindowState,
  applyWindowMode,
  writeWindowStateFile,
} = require('./windowState.cjs');
const { configureAutoUpdate } = require('./autoUpdate.cjs');
const steamworks = require('./steamworks.cjs');
const workshopMods = require('./workshopMods.cjs');

// WEB ROOT: packaged desktop serves the bundled release output in build/web/. Electron dev serves
// the project root so `npm run electron` and `node server.js 8123` run the same source route even
// when a stale build/web directory exists from an earlier package build.
const PROJECT_ROOT = path.join(__dirname, '..');
// The SpaceFace emblem (assets/brand): taskbar / window icon. Packaged builds embed the exe icon from the electron-builder
// config; this covers the live window and the unpackaged run. Windows takes the multi-size ICO (it carries the
// hand-tuned 16/24/32 px frames for the taskbar and title bar); other platforms take the 256 px PNG. A missing
// file leaves Electron's default.
const APP_ICON = path.join(PROJECT_ROOT, 'assets', 'brand', 'exports',
  process.platform === 'win32' ? 'spaceface.ico' : 'spaceface-launcher-256.png');
const BUNDLE_ROOT = path.join(PROJECT_ROOT, 'build', 'web');

// SAVE PERSISTENCE: the port MUST be fixed. localStorage (where saveSystem.js persists) is keyed by
// origin = scheme://host:port. A random port (listen(0)) changes the origin every launch, so every
// prior save becomes invisible. A fixed port keeps the origin stable across relaunches → saves persist.
const PORT = 41788;
const ISOLATED_PORT_RETRY_LIMIT = 3;
const ELECTRON_CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: ws: wss:; worker-src 'self' blob:; media-src 'self' data: blob:";
const KTX2_TRANSCODER_WORKER_PATH = 'vendor/addons/libs/basis/basis_transcoder.worker.js';
// Basis embind uses Function construction. Keep that permission out of the game document and grant
// it only to the deterministic external worker response that owns no DOM or Electron capabilities.
const ELECTRON_KTX2_WORKER_CONTENT_SECURITY_POLICY = "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval';";
const launchConfig = resolveElectronLaunchConfig(process.env);
const launchPort = launchConfig.isolatedEvidence ? launchConfig.port : PORT;
const playerStoreDir = launchConfig.isolatedEvidence ? null : resolvePlayerSaveDir(process.env);
// Historical source overlays are a probe-only feature. Never let an environment variable alter
// the player or packaged route; isolated evidence is the only launch mode that may pin bytes.
const sourceOverlayManifest = launchConfig.isolatedEvidence
  ? String(process.env.SPACEFACE_BASELINE_SOURCE_MANIFEST || '').trim() || null
  : null;
const migratePlayerStore = process.env.SPACEFACE_MIGRATE_PLAYER_STORE === '1';
// Player windows use normal Chromium throttling. A temporary evidence profile may opt out only
// through the explicit dual gate; the environment variable alone has no effect on normal play.
const allowEvidenceBackgroundExecution = launchConfig.isolatedEvidence === true
  && process.env.SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION === '1';
const hideEvidenceWindow = launchConfig.isolatedEvidence === true
  && process.env.SPACEFACE_EVIDENCE_HIDE_WINDOW === '1';
const backgroundThrottling = !allowEvidenceBackgroundExecution;
const RECEIPT_PATH = process.env.SPACEFACE_LAUNCH_RECEIPT || '';
const receipt = (status, details = {}) => appendLaunchReceipt(RECEIPT_PATH, status, details);
const SHELL_LIFECYCLE_CHANNEL = 'spaceface:shell-lifecycle';
let shellLifecycleSequence = 0;
let powerSuspended = false;
let screenLocked = false;
let powerLifecycleListenersInstalled = false;
let gameServerPortPromise = null;
let windowCreationPromise = null;
let appQuitting = false;
let resolvedUserContentDir;
let fatalBoxShown = false;

// User content ("mods") mount, PQ-172.00/.01. Resolved lazily so an isolated-evidence profile's
// userData override (applied at module scope below) governs the mods home too; isolated evidence
// mounts no mods at all. SPACEFACE_USER_CONTENT_DIR is the explicit override.
function mountedUserContentDir() {
  if (resolvedUserContentDir === undefined) {
    resolvedUserContentDir = launchConfig.isolatedEvidence ? null : resolveMountedUserContentDir(process.env, {
      platformDir: path.join(app.getPath('userData'), 'mods'),
    });
  }
  return resolvedUserContentDir;
}

app.on('before-quit', () => { appQuitting = true; });

const SHELL_QUIT_CHANNEL = 'spaceface:quit';
ipcMain.on(SHELL_QUIT_CHANNEL, () => {
  receipt('quit-requested', {});
  app.quit();
});

// PQ-160.01 clip export: the renderer may save a GIF/MP4 the encoder already produced.
// Filename is a basename only; bytes arrive as base64 so the sandbox never sees a path.
const SHELL_SAVE_CLIP_CHANNEL = 'spaceface:save-clip';
const CLIP_SAVE_MAX_BYTES = 24 * 1024 * 1024;
ipcMain.handle(SHELL_SAVE_CLIP_CHANNEL, async (_event, payload) => {
  const rawName = payload && typeof payload.filename === 'string' ? payload.filename : '';
  const filename = path.basename(rawName).replace(/[^\w.\-]+/g, '_');
  if (!filename || !/\.(gif|mp4)$/i.test(filename)) {
    return { ok: false, error: 'filename must be a .gif or .mp4 basename' };
  }
  const b64 = payload && typeof payload.bytesB64 === 'string' ? payload.bytesB64 : '';
  let bytes;
  try { bytes = Buffer.from(b64, 'base64'); } catch {
    return { ok: false, error: 'clip bytes were not valid base64' };
  }
  if (!bytes.length || bytes.length > CLIP_SAVE_MAX_BYTES) {
    return { ok: false, error: 'clip bytes missing or too large' };
  }
  const defaultDir = playerStoreDir || app.getPath('documents');
  const defaultPath = path.join(defaultDir, filename);
  const parent = _event && _event.sender ? BrowserWindow.fromWebContents(_event.sender) : null;
  const picked = await dialog.showSaveDialog(parent || undefined, {
    title: 'Save clip',
    defaultPath,
    filters: [
      { name: 'GIF', extensions: ['gif'] },
      { name: 'MP4', extensions: ['mp4'] },
    ],
  });
  if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };
  const dest = picked.filePath;
  const ext = path.extname(filename).toLowerCase();
  if (path.extname(dest).toLowerCase() !== ext) {
    return { ok: false, error: 'save path extension must match the clip format' };
  }
  fs.writeFileSync(dest, bytes);
  receipt('clip-saved', { path: dest, bytes: bytes.length });
  return { ok: true, path: dest, bytes: bytes.length };
});

// Explicit evidence probes use a temporary Chromium profile. Electron's single-instance lock is
// scoped by userData, so applying this before requestSingleInstanceLock gives the probe its own
// lock namespace and keeps player saves/preferences untouched. Normal launches never call setPath.
if (launchConfig.isolatedEvidence) {
  app.setPath('userData', launchConfig.userDataDir);
}

// PQ-033.01 release identity resolves once: version + build hash (release-receipt digest when
// packaged, git HEAD in dev, env pin for evidence). It feeds crash extras, the readable crash
// report files, and the build-info IPC the title/pause fine print reads through the preload bridge.
const releaseIdentity = resolveReleaseIdentity({ appApi: app, projectRoot: PROJECT_ROOT, env: process.env });

// The title/pause fine print reads version+build through this one channel; the payload is the
// public view only — never paths, env, or process internals.
const SHELL_BUILD_INFO_CHANNEL = 'spaceface:build-info';
ipcMain.handle(SHELL_BUILD_INFO_CHANNEL, () => publicBuildInfo(releaseIdentity));

// Probe-only witness: app.getAppMetrics() attributes CPU and working-set to each Chromium
// process (renderer vs GPU vs utility), so a headless perf probe can tell a GPU-process link
// stall from a renderer busy frame. Renderer main-frame CPU numbers already have in-page
// counters; this is the blind spot they don't cover. Read-only public shape — pid/type only.
const SHELL_PERF_METRICS_CHANNEL = 'spaceface:perf-metrics';
ipcMain.handle(SHELL_PERF_METRICS_CHANNEL, () => app.getAppMetrics().map((m) => ({
  pid: m.pid,
  type: m.type,
  cpuPercent: m.cpu && Number.isFinite(m.cpu.percentCPUUsage) ? m.cpu.percentCPUUsage : 0,
  workingSetKiB: m.memory && Number.isFinite(m.memory.workingSetSize) ? m.memory.workingSetSize : 0,
})));

// FB-106: Settings asks the shell which mode this window is in. The answer is the
// sender's window only. Isolated evidence never reaches this with a persisted file;
// the launch fullscreen flag above is untouched.
const SHELL_WINDOW_MODE_GET = 'spaceface:window-mode-get';
const SHELL_WINDOW_MODE_SET = 'spaceface:window-mode-set';
function senderWindow(event) {
  const contents = event && event.sender;
  if (!contents || typeof BrowserWindow.fromWebContents !== 'function') return null;
  const win = BrowserWindow.fromWebContents(contents);
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return null;
  return win;
}
ipcMain.handle(SHELL_WINDOW_MODE_GET, (event) => {
  const win = senderWindow(event);
  if (!win) return { ok: false, reason: 'no-window' };
  const mode = win.isFullScreen() ? 'fullscreen' : win.isMaximized() ? 'maximized' : 'windowed';
  return { ok: true, mode };
});
ipcMain.handle(SHELL_WINDOW_MODE_SET, (event, payload) => {
  const win = senderWindow(event);
  const mode = applyWindowMode(win, payload && payload.mode);
  if (!mode) return { ok: false, reason: 'bad-mode' };
  // Native fullscreen transitions settle asynchronously; report the accepted request.
  // Subsequent getWindowMode reads the native state after the transition.
  return { ok: true, mode };
});

// PQ-033.03 Steam: the optional steamworks.js binding (absent unless a Steam build adds it) behind two
// allowlisted channels. Unlock requests carry only a known achievement id; status is the public view.
// A direct (non-Steam) build reports available:false, and isolated evidence launches never touch
// Steam. The overlay needs its Chromium switches before app 'ready', so it is armed here.
const steamDistribution = steamworks.resolveDistribution({ env: process.env });
const steamAdapter = steamworks.createSteamworksAdapter({
  env: process.env,
  distribution: steamDistribution,
  disabledReason: launchConfig.isolatedEvidence ? 'isolated-evidence' : null,
  receipt,
});
steamAdapter.enableOverlay();
ipcMain.handle(steamworks.ACHIEVEMENT_UNLOCK_CHANNEL, (_event, payload) => steamAdapter.unlockAchievement(payload));
ipcMain.handle(steamworks.STEAM_STATUS_CHANNEL, () => steamAdapter.publicStatus());

// PQ-172.01 Steam Workshop for the user content directory: publish a local pack by manifest id and
// mirror subscribed items into workshop-<itemId>/ dirs the .00 loader scans. Only a mod id crosses
// the bridge — the shell resolves the directory itself. Non-Steam builds answer unavailable.
const workshopBridge = workshopMods.createWorkshopBridge({
  adapter: steamAdapter,
  userContentDir: mountedUserContentDir,
  receipt,
});
ipcMain.handle(workshopMods.WORKSHOP_STATUS_CHANNEL, () => workshopBridge.status());
ipcMain.handle(workshopMods.WORKSHOP_PUBLISH_CHANNEL, (_event, payload) => workshopBridge.publishMod(payload));
ipcMain.handle(workshopMods.WORKSHOP_SYNC_CHANNEL, () => workshopBridge.syncSubscribed());

// PQ-033.01 crash reports: Crashpad dumps under userData/crashes carry version+build in extras;
// human-readable JSON reports land alongside them on renderer/child-process/uncaught faults. Local
// files only — no upload store.
const CRASH_REPORT_SCHEMA = 'spaceface.crashReport.v1';
let crashReportSequence = 0;
startLeftoverCrashReporter(electron, releaseIdentity);
installCrashReportWriters(electron, releaseIdentity);

// Safe launch after a GPU fault. Three of the hints below push Chromium past its own safety
// nets (the GPU blocklist, the copy-free upload path, the discrete-GPU pin). On a bad driver that
// turns Chromium's safe fallback into a crash loop. A renderer or GPU-process crash in the last ten
// minutes, or --safe-graphics on the command line, leaves exactly those three off for this launch.
// Switches must be appended before 'ready', so the decision is made synchronously at module load.
const SAFE_GRAPHICS_FLAG = '--safe-graphics';
const SAFE_GRAPHICS_FRESH_MS = 10 * 60 * 1000;
const SAFE_GRAPHICS_SCAN_LIMIT = 8;
const SAFE_GRAPHICS_CLOCK_SKEW_MS = 60 * 1000;

function crashReportsDir() {
  let dumps = '';
  try { dumps = String(app.getPath('crashDumps') || ''); } catch (_) {}
  if (!dumps) {
    try { dumps = leftoverCrashDumpDir(app.getPath('userData')); } catch (_) {}
  }
  return dumps ? path.join(dumps, 'reports') : '';
}

// Real faults only: a renderer that crashed, or the GPU process dying. A deliberate kill, a clean
// exit, and every main-process report (startup failure, uncaught exception) say nothing about the
// graphics stack.
function isGpuFaultEvent(event) {
  if (!event || typeof event !== 'object') return false;
  const type = String(event.processType || '').toLowerCase();
  const reason = String(event.reason || '').toLowerCase();
  if (reason === 'clean-exit' || reason === 'killed') return false;
  return type === 'renderer' || type === 'child:gpu';
}

function crashReportAgeMs(report, file, now, fsApi) {
  const stamped = report && typeof report.writtenAt === 'string' ? Date.parse(report.writtenAt) : NaN;
  let writtenAt = stamped;
  if (!Number.isFinite(writtenAt)) {
    try { writtenAt = fsApi.statSync(file).mtimeMs; } catch (_) { writtenAt = NaN; }
  }
  return Number.isFinite(writtenAt) ? now - writtenAt : NaN;
}

// latest.json is the newest report, but a startup-failure report written after a GPU crash replaces
// it; the newest few dated report files keep that earlier GPU fault visible.
function findRecentGpuFault({
  reportsDir,
  now = Date.now(),
  freshMs = SAFE_GRAPHICS_FRESH_MS,
  fsApi = fs,
} = {}) {
  if (!reportsDir) return null;
  let names;
  try { names = fsApi.readdirSync(reportsDir); } catch (_) { return null; }
  const dated = names
    .filter((name) => /^report-.*\.json$/.test(String(name)))
    .sort()
    .reverse()
    .slice(0, SAFE_GRAPHICS_SCAN_LIMIT);
  for (const name of ['latest.json', ...dated]) {
    const file = path.join(reportsDir, name);
    let report;
    try { report = JSON.parse(fsApi.readFileSync(file, 'utf8')); } catch (_) { continue; }
    if (!report || report.schema !== CRASH_REPORT_SCHEMA || !isGpuFaultEvent(report.event)) continue;
    const ageMs = crashReportAgeMs(report, file, now, fsApi);
    if (!Number.isFinite(ageMs) || ageMs > freshMs || ageMs < -SAFE_GRAPHICS_CLOCK_SKEW_MS) continue;
    return {
      file,
      ageMs,
      processType: String(report.event.processType),
      reason: String(report.event.reason || ''),
    };
  }
  return null;
}

function decideSafeGraphics({
  argv,
  commandLine,
  reportsDir,
  now,
  freshMs,
  fsApi,
} = {}) {
  const args = Array.isArray(argv) ? argv : [];
  let flagged = args.some((arg) => arg === SAFE_GRAPHICS_FLAG);
  if (!flagged && commandLine && typeof commandLine.hasSwitch === 'function') {
    try { flagged = commandLine.hasSwitch(SAFE_GRAPHICS_FLAG.slice(2)) === true; } catch (_) {}
  }
  if (flagged) return { safe: true, why: 'flag' };
  const fault = findRecentGpuFault({ reportsDir, now, freshMs, fsApi });
  if (fault) return { safe: true, why: 'recent-crash', fault };
  return { safe: false, why: null };
}

function applyGpuHintSwitches(commandLine, decision) {
  const safe = !!(decision && decision.safe);
  if (!safe) commandLine.appendSwitch('ignore-gpu-blocklist');
  commandLine.appendSwitch('enable-gpu-rasterization');
  if (!safe) commandLine.appendSwitch('enable-zero-copy');
  // Hybrid-GPU systems may hand a browser-style app the power-saving adapter; the game
  // always wants the high-performance GPU. No-op where only one adapter exists.
  if (!safe) commandLine.appendSwitch('force_high_performance_gpu');
}

const safeGraphics = decideSafeGraphics({
  argv: process.argv,
  commandLine: app.commandLine,
  reportsDir: crashReportsDir(),
});
if (safeGraphics.safe) {
  const cause = safeGraphics.why === 'flag'
    ? SAFE_GRAPHICS_FLAG
    : `${safeGraphics.fault.processType} fault ${Math.round(safeGraphics.fault.ageMs / 1000)}s ago`;
  console.log(`[electron] safe graphics launch (${cause}): skipping the GPU blocklist override, zero-copy upload and high-performance GPU pin`);
  receipt('safe-graphics', {
    why: safeGraphics.why,
    fault: safeGraphics.fault ? { processType: safeGraphics.fault.processType, reason: safeGraphics.fault.reason } : null,
  });
}

// GPU hints (shell-only — must not change gameplay/renderer features).
applyGpuHintSwitches(app.commandLine, safeGraphics);
// ANGLE backend pin: Windows Chromium already selects d3d11 through its own heuristics, so
// the pin only stops per-machine drift (field trials, driver changes) between hardware
// runs. SPACEFACE_ANGLE_BACKEND overrides it on probe boxes ('default' leaves Chromium
// unpinned); other platforms keep their platform backend untouched.
const ANGLE_BACKEND_CHOICES = new Set(['d3d9', 'd3d11', 'd3d11on12', 'vulkan', 'gl', 'gles']);
if (process.platform === 'win32') {
  const requestedAngle = String(process.env.SPACEFACE_ANGLE_BACKEND || '').trim().toLowerCase();
  if (requestedAngle !== 'default') {
    app.commandLine.appendSwitch('use-angle', ANGLE_BACKEND_CHOICES.has(requestedAngle) ? requestedAngle : 'd3d11');
  }
}
// V8 young-gen pacing: the flight loop holds near-zero steady-state allocation, so
// scavenges fire almost only on admission/decode bursts — each is a ~1ms pause that
// can land inside a presented frame. Pinning the nursery at 64MB per semi-space
// (V8's own controller settles at ~16MB under its mutator-utilization model) makes
// burst scavenges ~4-10x rarer at equal throughput — a `--max-` cap alone is a
// no-op because the utilization controller, not the ceiling, picks the size
// (verified: identical scavenge curves; the pin drops a burst workload 20→2).
// js-flags is forwarded to every isolate the shell spawns (renderer + decode
// workers); commit follows use, so the cost is reserved address space, not RSS.
// SPACEFACE_SEMI_SPACE_MB overrides the size for probe boxes; 'default' unsets it.
const SEMI_SPACE_MB = Number(String(process.env.SPACEFACE_SEMI_SPACE_MB || '64').trim());
if (Number.isInteger(SEMI_SPACE_MB) && SEMI_SPACE_MB >= 8 && SEMI_SPACE_MB <= 512) {
  app.commandLine.appendSwitch('js-flags',
    `--min-semi-space-size=${SEMI_SPACE_MB} --max-semi-space-size=${SEMI_SPACE_MB}`);
}
// Browser-chrome subsystems a localhost game shell never uses — keeps their periodic
// discovery/sync work out of the process.
app.commandLine.appendSwitch('disable-features',
  'MediaRouter,DialMediaRouteProvider,OptimizationHints,Translate,AutofillServerCommunication');
// The game is served entirely same-origin from the in-process loopback server, so Chromium's
// background networking stack (component updater, variations/seed fetches, safe-browsing and
// dictionary downloads) can never produce bytes the app consumes — only wakeups and disk IO.
app.commandLine.appendSwitch('disable-background-networking');
// Remaining browser-process services that still initialize despite the blanket switch:
// the component updater, domain-reliability reporter, and UMA upload scheduling. The shell
// ships no updatable components and uploads nothing, so all three are idle wakeups + IO.
// metrics-recording-only keeps local histogram recording (useful for debugging) while
// cutting the upload path entirely. Page-initiated fetches are unaffected.
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('metrics-recording-only');

async function startServer() {
  let root;
  try {
    root = resolveWebRoot({ packaged: app.isPackaged, projectRoot: PROJECT_ROOT, bundleRoot: BUNDLE_ROOT });
  } catch (error) {
    receipt('package-invalid', { code: error.code, message: error.message, entry: error.entry });
    throw error;
  }

  const attemptLimit = launchConfig.isolatedEvidence ? ISOLATED_PORT_RETRY_LIMIT : 1;
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const { server, actualPort } = await listenGameServer(root, launchPort);
    if (isAllowedElectronListenerPort({ isolatedEvidence: launchConfig.isolatedEvidence, port: actualPort })) {
      receipt('server-ready', {
        port: actualPort,
        requestedPort: launchPort,
        isolatedEvidence: launchConfig.isolatedEvidence,
        attempt,
      });
      return actualPort;
    }

    await closeListeningServer(server);
    receipt('isolated-port-retry', { port: actualPort, attempt, attemptLimit });
  }

  const error = new Error(`isolated Electron listener repeatedly resolved to forbidden player port ${PORT}`);
  error.code = 'SPACEFACE_ISOLATED_PORT_COLLISION';
  throw error;
}

function ensureGameServerPort() {
  if (!gameServerPortPromise) {
    gameServerPortPromise = startServer().catch((error) => {
      // A failed bind never becomes the retained process server. Initial startup owns the fatal
      // classification below; clearing here prevents a rejected promise from masquerading as a
      // live listener if another lifecycle callback observes it first.
      gameServerPortPromise = null;
      throw error;
    });
  }
  return gameServerPortPromise;
}

function listenGameServer(root, requestedPort) {
  return new Promise((resolve, reject) => {
    const server = createGameServer({
      root,
      // Packaged GLBs and embedded KTX2 payloads can be tens of megabytes. Keep filesystem
      // admission off Electron's main thread so shell lifecycle and the fixed save origin stay live.
      async: true,
      devDiagnostics: !app.isPackaged,
      // Packaged bytes can't change between launches of one build: pin app-source files
      // immutable so a warm launch skips the module graph's conditional-GET sweep. The pin
      // is keyed to the packaged build digest — a build change clears the origin cache on
      // the next index.html before any stale module can serve.
      appSourceImmutable: app.isPackaged,
      playerStoreDir,
      userContentDir: mountedUserContentDir(),
      sourceOverlay: sourceOverlayManifest,
      staticHeaders: { 'Content-Security-Policy': ELECTRON_CONTENT_SECURITY_POLICY },
      staticHeadersByPath: {
        [KTX2_TRANSCODER_WORKER_PATH]: {
          'Content-Security-Policy': ELECTRON_KTX2_WORKER_CONTENT_SECURITY_POLICY,
        },
      },
    });
    // Keep the fixed origin authoritative. An ephemeral fallback hides the actual port owner and
    // makes existing localStorage saves disappear for the run, so classify contention instead.
    server.once('error', async (err) => {
      try {
        if (err && err.code === 'EADDRINUSE') {
          // A probe that throws must not leave the bind promise unsettled: that is a launch that
          // neither opens a window nor exits.
          let owner = 'unknown';
          try { owner = await probeSpaceFacePort(requestedPort) ? 'spaceface' : 'other'; } catch (_) {}
          receipt('port-conflict', { owner, port: requestedPort, message: err.message });
        }
      } finally {
        reject(err);
      }
    });
    server.listen(requestedPort, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = address && typeof address === 'object' ? address.port : requestedPort;
      resolve({ server, actualPort });
    });
  });
}

function closeListeningServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function systemLifecycleSuspended() {
  return powerSuspended || screenLocked;
}

function deriveWindowLifecycleState(win) {
  if (systemLifecycleSuspended()) return 'system-suspended';
  // An explicitly hidden isolated probe presents offscreen without stealing focus.
  if (hideEvidenceWindow && allowEvidenceBackgroundExecution && win && !win.isDestroyed()) {
    return 'foreground-visible';
  }
  if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) {
    return 'hidden-or-minimized';
  }
  return win.isFocused() ? 'foreground-visible' : 'foreground-occluded';
}

function publishWindowLifecycle(win, reason) {
  if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) return false;
  const command = {
    state: deriveWindowLifecycleState(win),
    sequence: ++shellLifecycleSequence,
    reason,
  };
  try {
    win.webContents.send(SHELL_LIFECYCLE_CHANNEL, command);
    return true;
  } catch (error) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      receipt('lifecycle-publish-failed', {
        reason,
        state: command.state,
        sequence: command.sequence,
        message: error && error.message ? error.message : String(error),
      });
    }
    return false;
  }
}

function publishAllWindowLifecycles(reason) {
  for (const win of BrowserWindow.getAllWindows()) publishWindowLifecycle(win, reason);
}

function installPowerLifecycleListeners() {
  if (powerLifecycleListenersInstalled) return;
  powerLifecycleListenersInstalled = true;
  powerMonitor.on('suspend', () => {
    powerSuspended = true;
    publishAllWindowLifecycles('suspend');
  });
  powerMonitor.on('resume', () => {
    powerSuspended = false;
    publishAllWindowLifecycles('resume');
  });
  powerMonitor.on('lock-screen', () => {
    screenLocked = true;
    publishAllWindowLifecycles('lock-screen');
  });
  powerMonitor.on('unlock-screen', () => {
    screenLocked = false;
    publishAllWindowLifecycles('unlock-screen');
  });
}

function bindWindowLifecycle(win) {
  for (const eventName of ['hide', 'minimize', 'show', 'restore', 'focus', 'blur']) {
    win.on(eventName, () => publishWindowLifecycle(win, eventName));
  }
  win.webContents.on('did-finish-load', () => publishWindowLifecycle(win, 'did-finish-load'));
}

function installWindowSecurity(win, gameUrl) {
  const gameOrigin = new URL(gameUrl).origin;
  win.webContents.setWindowOpenHandler((details) => {
    receipt('window-open-blocked', { url: receiptText(details && details.url) });
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (isCanonicalGameUrl(targetUrl, gameUrl)) return;
    event.preventDefault();
    receipt('navigation-blocked', { url: receiptText(targetUrl) });
  });

  const permissionSession = win.webContents.session;
  permissionSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => (
    isOwnedPointerLockPermission(win, gameOrigin, webContents, permission, requestingOrigin, details)
  ));
  permissionSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingOrigin = details && (
      details.requestingOrigin || details.securityOrigin || details.requestingUrl
    );
    const allowed = isOwnedPointerLockPermission(
      win,
      gameOrigin,
      webContents,
      permission,
      requestingOrigin,
      details,
    );
    if (!allowed) {
      receipt('permission-denied', {
        permission: receiptText(permission),
        origin: receiptText(requestingOrigin),
      });
    }
    callback(allowed);
  });
}

function isOwnedPointerLockPermission(win, gameOrigin, webContents, permission, requestingOrigin, details) {
  if (permission !== 'pointerLock' || webContents !== win.webContents) return false;
  const candidate = requestingOrigin || details && (
    details.requestingOrigin || details.securityOrigin || details.requestingUrl
  );
  try { return new URL(String(candidate || '')).origin === gameOrigin; }
  catch { return false; }
}

function isCanonicalGameUrl(candidate, gameUrl) {
  try { return new URL(String(candidate || '')).href === gameUrl; }
  catch { return false; }
}

function isCommittedCanonicalLoadAbort(
  code,
  rejectedUrl,
  win,
  gameUrl,
  canonicalLoadCommitted,
  initialCanonicalLoadPending,
) {
  if (initialCanonicalLoadPending !== true
    || canonicalLoadCommitted !== true
    || (code !== 'ERR_ABORTED' && code !== -3)
    || !isCanonicalGameUrl(rejectedUrl, gameUrl)
    || !win || win.isDestroyed()
    || !win.webContents || win.webContents.isDestroyed()) {
    return false;
  }
  try { return isCanonicalGameUrl(win.webContents.getURL(), gameUrl); }
  catch { return false; }
}

function receiptText(value) {
  return String(value || '').slice(0, 500);
}

function leftoverCrashDumpDir(userDataPath) {
  return path.join(String(userDataPath || ''), 'crashes');
}

function leftoverCrashExtra(identity) {
  const extra = {};
  if (identity && typeof identity.version === 'string' && identity.version.trim()) {
    extra.version = identity.version.trim().slice(0, 127);
  }
  if (identity && typeof identity.build === 'string' && identity.build.trim()) {
    extra.build = identity.build.trim().slice(0, 127);
  }
  if (identity && identity.demo === true) extra.demo = 'true';
  return extra;
}

function leftoverCrashIdentity(appApi = app, build = '', demo = false) {
  let version = '';
  try {
    if (appApi && typeof appApi.getVersion === 'function') {
      version = String(appApi.getVersion() || '');
    }
  } catch (_) {}
  return leftoverCrashExtra({ version, build, demo });
}

function startLeftoverCrashReporter(electronApi = electron, identity = null) {
  const crashReporter = electronApi && electronApi.crashReporter;
  const appApi = (electronApi && electronApi.app) || app;
  if (!crashReporter || typeof crashReporter.start !== 'function') {
    return { started: false, reason: 'crashReporter-missing' };
  }

  let userDataPath = '';
  try {
    if (appApi && typeof appApi.getPath === 'function') {
      userDataPath = String(appApi.getPath('userData') || '');
    }
  } catch (_) {}

  const dumpDir = leftoverCrashDumpDir(userDataPath);
  try {
    if (dumpDir && appApi && typeof appApi.setPath === 'function') {
      appApi.setPath('crashDumps', dumpDir);
    }
  } catch (_) {}

  const extra = leftoverCrashIdentity(appApi, identity && identity.build, !!(identity && identity.demo));
  // Product name travels with the packaged identity: a demo build dumps under
  // "SpaceFace Demo" so a demo crash report names the flavor it came from.
  let productName = 'SpaceFace';
  try {
    const named = appApi && typeof appApi.getName === 'function' ? String(appApi.getName() || '') : '';
    if (named.trim()) productName = named.trim();
  } catch (_) {}
  crashReporter.start({
    productName,
    uploadToServer: false,
    extra,
    globalExtra: extra,
  });
  return { started: true, dumpDir, extra };
}

// A crashpad .dmp is binary; the done-when asks for a report that names the build. So every
// process-level fault also writes a plain JSON report next to the dumps, and refreshes
// crashes/reports/latest.json so the newest crash is always one file deep.

function writeCrashReport({ reportDir, identity, event }) {
  const dir = path.join(String(reportDir || ''), 'reports');
  const writtenAt = new Date().toISOString();
  const report = {
    schema: CRASH_REPORT_SCHEMA,
    writtenAt,
    version: identity && identity.version ? String(identity.version) : '',
    build: identity && identity.build ? String(identity.build) : '',
    packaged: !!(identity && identity.packaged),
    demo: !!(identity && identity.demo),
    event: event || {},
    uptimeSeconds: typeof process.uptime === 'function' ? Math.round(process.uptime()) : null,
    pid: typeof process.pid === 'number' ? process.pid : null,
    runtime: collectRuntimeIdentity(),
  };
  const body = `${JSON.stringify(report, null, 2)}\n`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const stamp = writtenAt.replace(/[:.]/g, '-');
    const written = path.join(dir, `report-${stamp}-${report.pid || 0}-${++crashReportSequence}.json`);
    fs.writeFileSync(written, body, 'utf8');
    const latestPath = path.join(dir, 'latest.json');
    fs.writeFileSync(latestPath + '.tmp', body, 'utf8');
    fs.renameSync(latestPath + '.tmp', latestPath);
    receipt('crash-report-written', { path: written, processType: report.event.processType });
    return { written, report };
  } catch (error) {
    receipt('crash-report-write-failed', {
      message: error && error.message ? error.message : String(error),
    });
    return { written: null, report };
  }
}

function installCrashReportWriters(electronApi = electron, identity = releaseIdentity) {
  const appApi = (electronApi && electronApi.app) || app;
  const dialogApi = (electronApi && electronApi.dialog) || dialog;
  let dumpDir = '';
  try {
    if (appApi && typeof appApi.getPath === 'function') {
      dumpDir = String(appApi.getPath('crashDumps') || '');
    }
  } catch (_) {}
  if (!dumpDir) return { installed: false, reason: 'no-dump-dir' };

  const emit = (event) => writeCrashReport({ reportDir: dumpDir, identity, event });
  // process-gone fires on ordinary teardown too — 'clean-exit' on every normal quit, and Chromium
  // routinely kills/respawns GPU and utility children. None of those are the crash this file is
  // for; only real faults write reports, and a quitting app reports nothing.
  if (typeof appApi.on === 'function') {
    appApi.on('render-process-gone', (_event, webContents, details = {}) => {
      const reason = details && details.reason;
      if (appQuitting || reason === 'clean-exit') return;
      // A webContents already mid-teardown throws on any property access.
      let webContentsId = null;
      try { webContentsId = webContents && !webContents.isDestroyed() ? (webContents.id ?? null) : null; }
      catch (_) {}
      emit({
        processType: 'renderer',
        reason: reason || '',
        exitCode: (details && details.exitCode) ?? null,
        webContentsId,
      });
    });
    appApi.on('child-process-gone', (_event, details = {}) => {
      const reason = details && details.reason;
      if (appQuitting || reason === 'clean-exit' || reason === 'killed') return;
      emit({
        processType: details && details.type ? `child:${details.type}` : 'child',
        reason: reason || '',
        exitCode: (details && details.exitCode) ?? null,
        serviceName: (details && details.serviceName) || '',
      });
    });
  }
  if (typeof process.on === 'function') {
    process.on('uncaughtException', (error) => {
      const { written } = emit({
        processType: 'main',
        reason: 'uncaughtException',
        message: error && error.message ? String(error.message).slice(0, 1000) : String(error || ''),
        stack: String((error && error.stack) || error || '').slice(0, 8000),
      });
      // The handler suppresses Node's own stderr dump; keep the crash loud on dev consoles.
      console.error(error);
      // A player's game that just vanishes looks like it never ran: say what happened, once, and
      // where the report is. The exit below runs whatever the box does.
      try {
        showFatalBox(describeUnexpectedFailure(error, {
          reportPath: written,
          reportDir: path.join(dumpDir, 'reports'),
        }), dialogApi);
      } catch (_) {}
      // exit() bypasses will-quit, so a downloaded update does not auto-install on a crash-quit.
      if (typeof process.exit === 'function') process.exit(1);
    });
  }
  return { installed: true, reportDir: path.join(dumpDir, 'reports') };
}

function collectRuntimeIdentity() {
  const versions = process.versions || {};
  return {
    electron: versions.electron || null,
    chromium: versions.chrome || null,
    node: versions.node || null,
    v8: versions.v8 || null,
    packaged: app.isPackaged === true,
    executablePath: readAppPath('exe') || process.execPath || null,
    resourcesPath: process.resourcesPath || null,
    userDataPath: readAppPath('userData'),
  };
}

function readAppPath(name) {
  try { return typeof app.getPath === 'function' ? app.getPath(name) : null; }
  catch { return null; }
}

// ── Failures the player can see ───────────────────────────────────────────────────────────────
// A double-clicked game that exits, or sits on a blank window, reads as "it never ran". These
// helpers turn the silent endings (startup failure, main-process fault, dead or hung renderer)
// into a plain message that names the crash report. Isolated evidence and the store-migration run
// never raise modal boxes: a blocking box would hang an unattended probe, and an automatic reload
// would hide the very crash the probe exists to witness.
const STARTUP_ERROR_TITLE = 'SpaceFace could not start';
const FATAL_ERROR_TITLE = 'SpaceFace has stopped';
const RENDERER_AUTO_RELOAD_WINDOW_MS = 2 * 60 * 1000;
const UNRESPONSIVE_GRACE_MS = 15 * 1000;
const UNRESPONSIVE_RECHECK_MS = 30 * 1000;
const INTENTIONAL_KILL_GRACE_MS = 5 * 1000;

function shellDialogsEnabled() {
  return !launchConfig.isolatedEvidence && !migratePlayerStore;
}

function firstLine(value, max = 300) {
  const text = String(value == null ? '' : value).split(/\r?\n/)[0].trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function crashReportLine(reportPath, reportDir) {
  if (reportPath) return `A crash report was saved to:\n${reportPath}`;
  if (reportDir) return `Crash reports are kept in:\n${reportDir}`;
  return '';
}

function describeStartupFailure(error, { port = launchPort, reportPath = '', reportDir = '' } = {}) {
  const code = error && error.code;
  let cause;
  if (code === 'EADDRINUSE') {
    cause = `Another copy of SpaceFace, or another program, is already using the connection (port ${port}) that SpaceFace needs. Close it and try again.`;
  } else if (code === 'SPACEFACE_PACKAGED_BUNDLE_MISSING') {
    cause = 'SpaceFace\'s game files are missing or incomplete. Please reinstall the game and try again.';
  } else {
    const detail = firstLine(error && error.message ? error.message : error);
    cause = `The game window could not be opened.${detail ? `\n\nDetails: ${detail}` : ''}`;
  }
  return {
    title: STARTUP_ERROR_TITLE,
    message: [cause, crashReportLine(reportPath, reportDir)].filter(Boolean).join('\n\n'),
  };
}

function describeUnexpectedFailure(error, { reportPath = '', reportDir = '' } = {}) {
  const detail = firstLine(error && error.message ? error.message : error);
  const where = crashReportLine(reportPath, reportDir);
  const lines = ['SpaceFace ran into an unexpected problem and has to close.'];
  if (detail) lines.push(`Details: ${detail}`);
  if (where) lines.push(where, 'If it keeps happening, please send that report along when you tell us about it.');
  return { title: FATAL_ERROR_TITLE, message: lines.join('\n\n') };
}

// At most one fatal box per process, none while the player is already quitting, and never a
// reason to skip the exit that follows.
function showFatalBox({ title, message }, dialogApi = dialog) {
  if (fatalBoxShown || appQuitting || !shellDialogsEnabled()) return false;
  if (!dialogApi || typeof dialogApi.showErrorBox !== 'function') return false;
  fatalBoxShown = true;
  try { dialogApi.showErrorBox(title, message); } catch (_) { /* exit regardless */ }
  return true;
}

// Startup failures used to leave no file at all (the launch receipt exists only for probes), so the
// box had nothing to point at. Write the same readable report the other faults write.
function writeStartupFailureReport(error) {
  let dumpDir = '';
  try { dumpDir = String(app.getPath('crashDumps') || ''); } catch (_) {}
  if (!dumpDir) return { written: null, reportDir: '' };
  const reportDir = path.join(dumpDir, 'reports');
  try {
    const { written } = writeCrashReport({
      reportDir: dumpDir,
      identity: releaseIdentity,
      event: {
        processType: 'main',
        reason: 'startup-failed',
        code: error && error.code ? String(error.code) : '',
        message: error && error.message ? String(error.message).slice(0, 1000) : String(error || ''),
        stack: String((error && error.stack) || error || '').slice(0, 8000),
      },
    });
    return { written, reportDir };
  } catch (_) {
    return { written: null, reportDir };
  }
}

// A renderer that dies or hangs after the page has loaded must not leave a blank window. One
// automatic reload per RENDERER_AUTO_RELOAD_WINDOW_MS (the boot path's single-retry rule); a second
// death inside that window asks the player. A hang is offered Wait / Reload once it has lasted
// UNRESPONSIVE_GRACE_MS. Everything is injectable so the shell tests drive it without Electron.
function createRendererRecovery({
  win,
  gameUrl,
  dialogApi = null,
  quitApp = () => {},
  onReceipt = () => {},
  now = () => Date.now(),
  setTimer = typeof setTimeout === 'function' ? setTimeout : null,
  clearTimer = typeof clearTimeout === 'function' ? clearTimeout : null,
  isQuitting = () => false,
  isSuspended = () => false,
} = {}) {
  const canAsk = !!(dialogApi && typeof dialogApi.showMessageBox === 'function');
  let armed = false;
  let disposed = false;
  let lastAutoReloadAt = null;
  let dialogOpen = false;
  // A renderer death reported while a dialog is already open (the hang box, or a failed restart's
  // box). Kept so it is handled once the box is answered, instead of being dropped with its timer.
  let pendingGone = null;
  let unresponsive = false;
  let unresponsiveTimer = null;
  let ignoreGoneUntil = 0;

  function live() {
    try {
      return !disposed && !!win && !win.isDestroyed() && !!win.webContents && !win.webContents.isDestroyed();
    } catch (_) {
      return false;
    }
  }

  function clearUnresponsiveTimer() {
    if (unresponsiveTimer === null) return;
    try { if (clearTimer) clearTimer(unresponsiveTimer); } catch (_) {}
    unresponsiveTimer = null;
  }

  function armUnresponsiveTimer(delayMs) {
    clearUnresponsiveTimer();
    if (!setTimer) return;
    unresponsiveTimer = setTimer(onUnresponsiveTimer, delayMs);
    if (unresponsiveTimer && typeof unresponsiveTimer.unref === 'function') unresponsiveTimer.unref();
  }

  // The canonical game URL, not a history reload: it always lands on the one origin the saves live
  // under. After a hang the stuck process is ended first so the load gets a fresh one.
  function reloadGame({ fromHang = false } = {}) {
    if (!live()) return false;
    const contents = win.webContents;
    if (fromHang && typeof contents.forcefullyCrashRenderer === 'function') {
      ignoreGoneUntil = now() + INTENTIONAL_KILL_GRACE_MS;
      try { contents.forcefullyCrashRenderer(); } catch (_) { ignoreGoneUntil = 0; }
    }
    let pending;
    try { pending = contents.loadURL(gameUrl); } catch (error) { pending = Promise.reject(error); }
    Promise.resolve(pending).catch(onReloadFailed);
    return true;
  }

  function onReloadFailed(error) {
    const code = error && error.code;
    onReceipt('renderer-reload-failed', {
      code: code === undefined ? null : code,
      message: receiptText(error && error.message ? error.message : error),
    });
    // ERR_ABORTED means a newer navigation superseded this one; it is not a failed recovery.
    if (code === 'ERR_ABORTED' || code === -3) return;
    if (!live() || isQuitting()) return;
    void offerGoneChoice('The game window could not be restarted.');
  }

  async function ask(options) {
    if (!canAsk) return null;
    dialogOpen = true;
    try {
      const result = await (live()
        ? dialogApi.showMessageBox(win, options)
        : dialogApi.showMessageBox(options));
      return result && typeof result.response === 'number' ? result.response : null;
    } catch (_) {
      return null;
    } finally {
      dialogOpen = false;
    }
  }

  async function offerGoneChoice(message) {
    if (dialogOpen || !live() || isQuitting()) return;
    onReceipt('renderer-recovery-dialog', { kind: 'gone' });
    const response = await ask({
      type: 'error',
      title: 'SpaceFace',
      message,
      detail: 'SpaceFace already tried restarting it. Progress up to your last save is kept. Reload to try again, or quit and open the game again.',
      buttons: ['Reload', 'Quit'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) {
      pendingGone = null;
      reloadGame();
    } else if (response === 1) {
      pendingGone = null;
      quitApp();
    } else {
      settlePendingGone();
    }
  }

  async function offerUnresponsiveChoice() {
    onReceipt('renderer-recovery-dialog', { kind: 'unresponsive' });
    const response = await ask({
      type: 'warning',
      title: 'SpaceFace',
      message: 'SpaceFace is not responding.',
      detail: 'It may just be busy. Wait to give it more time, or Reload to restart the game window.',
      buttons: ['Wait', 'Reload'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (response === 1) {
      // A renderer that already died while the box was up has nothing left to end.
      const alreadyGone = pendingGone !== null;
      pendingGone = null;
      unresponsive = false;
      reloadGame({ fromHang: !alreadyGone });
    } else if (pendingGone !== null) {
      // Wait was chosen, but the renderer died behind the box: waiting cannot help a dead window.
      settlePendingGone();
    } else if (unresponsive && live() && !isQuitting()) {
      armUnresponsiveTimer(UNRESPONSIVE_RECHECK_MS);
    }
  }

  function onGone(_event, details) {
    const reason = details && details.reason;
    unresponsive = false;
    clearUnresponsiveTimer();
    if (!armed || !live() || isQuitting() || reason === 'clean-exit') return;
    // The process we just ended on purpose (Reload after a hang) reports in as gone; that is the
    // reload already under way, not a new crash to spend the budget on.
    if (ignoreGoneUntil > 0 && now() < ignoreGoneUntil) {
      ignoreGoneUntil = 0;
      return;
    }
    if (dialogOpen) {
      pendingGone = { reason };
      return;
    }
    recoverFromGone(reason);
  }

  // The recovery proper: one automatic reload per window, then ask. It also runs for a death held
  // behind a dialog (settlePendingGone), once the answer is in and the window state is rechecked.
  function recoverFromGone(reason) {
    const at = now();
    if (lastAutoReloadAt === null || at - lastAutoReloadAt >= RENDERER_AUTO_RELOAD_WINDOW_MS) {
      lastAutoReloadAt = at;
      onReceipt('renderer-auto-reload', { reason: receiptText(reason) });
      reloadGame();
      return;
    }
    void offerGoneChoice('The game window stopped working again.');
  }

  function settlePendingGone() {
    const held = pendingGone;
    pendingGone = null;
    if (held === null || !armed || !live() || isQuitting()) return;
    recoverFromGone(held.reason);
  }

  function onUnresponsive() {
    if (!armed || !live() || !canAsk) return;
    unresponsive = true;
    onReceipt('renderer-unresponsive', {});
    if (unresponsiveTimer === null && !dialogOpen) armUnresponsiveTimer(UNRESPONSIVE_GRACE_MS);
  }

  function onResponsive() {
    unresponsive = false;
    clearUnresponsiveTimer();
  }

  function onUnresponsiveTimer() {
    unresponsiveTimer = null;
    if (!unresponsive || !armed || !live() || isQuitting()) return;
    // A sleeping or locked machine looks hung on wake; ask later, not now.
    if (isSuspended() || dialogOpen) {
      armUnresponsiveTimer(UNRESPONSIVE_GRACE_MS);
      return;
    }
    void offerUnresponsiveChoice();
  }

  function dispose() {
    disposed = true;
    pendingGone = null;
    clearUnresponsiveTimer();
  }

  const api = {
    arm() { armed = true; },
    dispose,
    onGone,
    onUnresponsive,
    onResponsive,
    bind() {
      const contents = win.webContents;
      contents.on('render-process-gone', onGone);
      contents.on('unresponsive', onUnresponsive);
      contents.on('responsive', onResponsive);
      if (typeof win.once === 'function') win.once('closed', dispose);
      return api;
    },
  };
  return api;
}

// ── FB-106: the desktop shell remembers its window ────────────────────────────────────────────
// One window-state.json under userData: bounds + mode, written on resize/move/mode changes
// (debounced) and flushed on close. Restored on the next create and validated against the
// CURRENT displays, so a monitor that went away can never strand the window off-screen.
// Isolated evidence keeps its launch contract: a throwaway profile, no persistence, and the
// default fullscreen exactly as before — the launch must not change shape because a probe ran.
const WINDOW_STATE_SAVE_DEBOUNCE_MS = 600;

function collectDisplayAreas() {
  try {
    if (typeof screen.getAllDisplays !== 'function') return [];
    return screen.getAllDisplays().map((display) => ({
      bounds: display && display.bounds,
      workArea: display && display.workArea,
    }));
  } catch {
    return [];
  }
}

function captureWindowState(win) {
  if (!win || win.isDestroyed()) return null;
  try {
    const bounds = typeof win.getNormalBounds === 'function' ? win.getNormalBounds() : win.getBounds();
    const mode = win.isFullScreen() ? 'fullscreen' : win.isMaximized() ? 'maximized' : 'windowed';
    return {
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      mode,
    };
  } catch {
    return null;
  }
}

function bindWindowStatePersistence(win, windowStatePath) {
  if (!windowStatePath) return;
  let saveTimer = null;
  const flush = () => {
    if (saveTimer !== null) {
      try { clearTimeout(saveTimer); } catch { /* ignore */ }
      saveTimer = null;
    }
    // A minimized window's bounds are meaningless; keep the last good ones.
    if (win.isDestroyed() || win.isMinimized()) return;
    const state = captureWindowState(win);
    if (state) writeWindowStateFile(windowStatePath, state);
  };
  const schedule = () => {
    if (saveTimer !== null) return;
    saveTimer = setTimeout(() => { saveTimer = null; flush(); }, WINDOW_STATE_SAVE_DEBOUNCE_MS);
    if (saveTimer && typeof saveTimer.unref === 'function') saveTimer.unref();
  };
  for (const eventName of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
    win.on(eventName, schedule);
  }
  win.on('close', flush);
}

async function createWindow() {
  installPowerLifecycleListeners();
  // macOS keeps the application process alive after the last window closes. Reuse the one
  // process-owned fixed-origin listener when Dock activation creates a replacement window; a
  // second bind would collide with our own server and strand the player without a window.
  const port = await ensureGameServerPort();
  // FB-106: restore the remembered window before the renderer loads. Isolated evidence keeps
  // its throwaway profile and never persists; its fullscreen launch contract is unchanged.
  const windowStatePath = launchConfig.isolatedEvidence
    ? null
    : path.join(app.getPath('userData'), WINDOW_STATE_FILE);
  const rememberedWindow = windowStatePath
    ? sanitizeWindowState(readWindowStateFile(windowStatePath), collectDisplayAreas())
    : null;
  const win = new BrowserWindow({
    width: rememberedWindow ? rememberedWindow.width : 1480,
    height: rememberedWindow ? rememberedWindow.height : 920,
    x: rememberedWindow && rememberedWindow.mode === 'windowed' ? rememberedWindow.x : undefined,
    y: rememberedWindow && rememberedWindow.mode === 'windowed' ? rememberedWindow.y : undefined,
    minWidth: 1024, minHeight: 640,
    backgroundColor: '#05070d', title: 'SpaceFace', show: false, icon: APP_ICON,
    fullscreen: rememberedWindow
      ? rememberedWindow.mode === 'fullscreen'
      : !launchConfig.isolatedEvidence,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // Every text input in the UI already carries spellcheck="false"; turning the webPreference
      // off skips the hunspell/dictionary service entirely instead of per-element opt-outs.
      spellcheck: false,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling,
      offscreen: hideEvidenceWindow,
      // Each module is fetched once per launch, so the 'code' heat check never arms on
      // this graph; 'bypassHeatCheck' writes the V8 code cache on first load and lets
      // later launches deserialize bytecode instead of recompiling every module.
      v8CacheOptions: 'bypassHeatCheck',
    },
  });
  if (hideEvidenceWindow) {
    win.webContents.setFrameRate(60);
    win.webContents.startPainting();
  }
  // S1 stage D: SPACEFACE_SIM_LANE opts the authoritative sim into its worker
  // lane for a launched shell — the canonical URL forbids query params, so the
  // lane ships through localStorage 'sf.simLane' via preload.cjs instead.
  const gameUrl = `http://127.0.0.1:${port}/`;
  // FB-106: a remembered maximized shell comes back maximized; fullscreen already applied above.
  if (rememberedWindow && rememberedWindow.mode === 'maximized') win.maximize();
  bindWindowStatePersistence(win, windowStatePath);
  let canonicalLoadCommitted = false;
  let initialCanonicalLoadPending = false;
  // Normal close remains cancellable until the renderer's save owner has settled its
  // existing exit save and shared-store writes. Forced process termination has no such guarantee.
  let quitPrepared = false;
  let quitPreparing = false;
  let quitToken = 0;
  const quitContents = win.webContents;
  const releaseInterruptedQuit = () => {
    if (!quitPreparing) return;
    quitPreparing = false;
    quitToken += 1;
    appQuitting = false;
  };
  const onQuitPrepared = async (event, token, result) => {
    if (event.sender !== quitContents || !quitPreparing || token !== quitToken) return;
    quitPreparing = false;
    if (win.isDestroyed() || quitContents.isDestroyed()) return;
    if (result?.ok === true) {
      quitPrepared = true;
      win.close();
      return;
    }
    appQuitting = false;
    try {
      await dialog.showMessageBox(win, {
        type: 'error', title: 'Save not finished',
        message: 'The game could not finish saving before closing.',
        detail: 'Check the save and try quitting again.',
        buttons: ['Return to game'], defaultId: 0,
      });
    } catch (_) { /* the window can close while the dialog is opening */ }
  };
  ipcMain.on('spaceface:quit-prepared', onQuitPrepared);
  quitContents.on('render-process-gone', releaseInterruptedQuit);
  quitContents.on('unresponsive', releaseInterruptedQuit);
  win.once('closed', () => {
    ipcMain.removeListener('spaceface:quit-prepared', onQuitPrepared);
    if (!quitContents.isDestroyed()) {
      quitContents.removeListener('render-process-gone', releaseInterruptedQuit);
      quitContents.removeListener('unresponsive', releaseInterruptedQuit);
    }
  });
  win.on('close', (event) => {
    if (quitPrepared || !canonicalLoadCommitted) return;
    event.preventDefault();
    if (quitPreparing) return;
    quitPreparing = true;
    try { quitContents.send('spaceface:prepare-quit', ++quitToken); }
    catch (_) {
      releaseInterruptedQuit();
      // The renderer cannot service the handoff. Honor the close without claiming a save.
      quitPrepared = true;
      if (!win.isDestroyed()) win.close();
    }
  });
  installWindowSecurity(win, gameUrl);
  // BrowserWindow.loadURL() can reject with ERR_ABORTED when the already-committed canonical page
  // reloads itself before Electron settles the original promise. That is no longer a startup
  // failure, but every pre-commit, foreign-URL, destroyed-window, and non-abort rejection remains
  // fatal. Observe the main-frame commit directly rather than inferring it from promise timing.
  win.webContents.on('did-finish-load', () => {
    if (isCanonicalGameUrl(win.webContents.getURL(), gameUrl)) canonicalLoadCommitted = true;
  });
  bindWindowLifecycle(win);
  // A renderer that dies or hangs after the page loaded must not strand a blank window. Armed below
  // once the first load has settled; until then startup failure owns the outcome. Evidence probes
  // keep a crash visible instead of reloading past it.
  const recovery = launchConfig.isolatedEvidence ? null : createRendererRecovery({
    win,
    gameUrl,
    dialogApi: dialog,
    quitApp: () => app.quit(),
    onReceipt: receipt,
    isQuitting: () => appQuitting,
    isSuspended: systemLifecycleSuspended,
  }).bind();
  win.removeMenu();
  win.webContents.on('before-input-event', (event, input) => {
    if (input && input.type === 'keyDown') {
      if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) {
        if (typeof win.setFullScreen === 'function' && typeof win.isFullScreen === 'function') {
          win.setFullScreen(!win.isFullScreen());
          event.preventDefault();
        }
      }
    }
  });
  win.once('ready-to-show', () => {
    receipt('window-ready', {
      port,
      backgroundThrottling,
      evidenceBackgroundOverride: allowEvidenceBackgroundExecution,
      fullscreen: !launchConfig.isolatedEvidence,
    });
    if (!hideEvidenceWindow) win.show();
  });
  win.webContents.on('did-fail-load', (_event, code, message, url, isMainFrame) => {
    if (!isMainFrame) return;
    if (isCommittedCanonicalLoadAbort(
      code,
      url,
      win,
      gameUrl,
      canonicalLoadCommitted,
      initialCanonicalLoadPending,
    )) return;
    receipt('navigation-failed', { code, message, url });
  });
  let motionHoldReceipts = 0;
  win.webContents.on('console-message', (details) => {
    const message = details && details.message;
    if (typeof message === 'string' && message.startsWith('[world-motion-hold] ')
      && motionHoldReceipts < 8) {
      motionHoldReceipts++;
      receipt('world-motion-hold', { message: message.slice(0, 8192) });
    }
    if (isAssetPreloadFailureMessage(message)) {
      receipt('asset-preload-failed', { message: receiptText(message) });
    }
  });
  // One player-facing launch URL: Electron and a browser tab both boot the same game route.
  // Release-only debug stripping is handled by the production bundle, not by a gameplay URL flag.
  initialCanonicalLoadPending = true;
  try {
    await win.loadURL(gameUrl);
  } catch (error) {
    if (!isCommittedCanonicalLoadAbort(
      error && error.code,
      error && error.url,
      win,
      gameUrl,
      canonicalLoadCommitted,
      initialCanonicalLoadPending,
    )) throw error;
    receipt('canonical-reload-aborted-after-commit', {
      code: error.code,
      url: win.webContents.getURL(),
    });
  } finally {
    initialCanonicalLoadPending = false;
  }
  if (recovery) recovery.arm();
  // win.webContents.openDevTools();
}

function handleWindowCreationFailure(error) {
  receipt('startup-failed', { code: error && error.code, message: error && error.message ? error.message : String(error) });
  console.error('[electron] desktop startup failed:', error);
  // Leave a report and tell the player why nothing opened, then exit. Neither step may stop the exit.
  try {
    const { written, reportDir } = writeStartupFailureReport(error);
    showFatalBox(describeStartupFailure(error, { reportPath: written, reportDir }));
  } catch (_) {}
  app.exit(1);
}

function requestGameWindow() {
  if (appQuitting) return null;
  if (!windowCreationPromise) {
    let trackedPromise;
    trackedPromise = createWindow()
      .catch(handleWindowCreationFailure)
      .finally(() => {
        if (windowCreationPromise === trackedPromise) windowCreationPromise = null;
      });
    windowCreationPromise = trackedPromise;
  }
  return windowCreationPromise;
}

async function runPlayerStoreMigration() {
  if (!playerStoreDir) {
    receipt('player-store-migrated', { keyCount: 0, skipped: 'no-store' });
    app.quit();
    return;
  }
  const port = await ensureGameServerPort();
  const originUrl = `http://127.0.0.1:${port}${PLAYER_STORE_ORIGIN_ROUTE}`;
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: true,
    },
  });
  try {
    await win.loadURL(originUrl);
    const dumped = await win.webContents.executeJavaScript(LOCAL_STORAGE_DUMP_SOURCE, true);
    const keys = dumped && typeof dumped === 'object' ? dumped : {};
    const written = writePlayerStoreKeysSync(playerStoreDir, keys);
    receipt('player-store-migrated', {
      keyCount: Object.keys(written || {}).length,
      port,
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
    app.quit();
  }
}

// Windows taskbar identity: same id as package.json build.appId, so the taskbar button, pinned shortcut and
// Alt-Tab entry all resolve to the SpaceFace icon instead of the host Electron's. No-op off Windows.
if (process.platform === 'win32' && typeof app.setAppUserModelId === 'function') {
  app.setAppUserModelId('com.spaceface.game');
}

// Single-instance lock: a second launch focuses the existing window instead of starting a rival
// server that would lose the fixed port (and split saves across origins).
if (!app.requestSingleInstanceLock()) {
  receipt('existing-instance');
  app.quit();
} else if (migratePlayerStore) {
  receipt('starting', {
    port: launchPort,
    isolatedEvidence: launchConfig.isolatedEvidence,
    lockNamespace: launchConfig.lockNamespace,
    migratePlayerStore: true,
    runtime: collectRuntimeIdentity(),
  });
  // Binding the loopback listener is pure Node work; run it while Chromium still initializes
  // so it leaves the window-critical path. The first awaiter still owns failure handling.
  void ensureGameServerPort().catch(() => {});
  app.whenReady()
    .then(() => runPlayerStoreMigration())
    .catch(handleWindowCreationFailure);
} else {
  receipt('starting', {
    port: launchPort,
    isolatedEvidence: launchConfig.isolatedEvidence,
    lockNamespace: launchConfig.lockNamespace,
    backgroundThrottling,
    evidenceBackgroundOverride: allowEvidenceBackgroundExecution,
    runtime: collectRuntimeIdentity(),
  });
  // Binding the loopback listener is pure Node work; run it while Chromium still initializes
  // so it leaves the window-critical path. The first awaiter still owns failure handling.
  void ensureGameServerPort().catch(() => {});
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    } else {
      // macOS can keep the first application process alive after its last window closes. A later
      // executable launch is still player intent to see the game, so recover through the same
      // single-flight path as Dock activation rather than silently consuming the launch.
      void requestGameWindow();
    }
  });
  app.whenReady()
    .then(() => {
      void requestGameWindow();
      // Auto-update is a packaged-route citizen: check once after boot, download quietly, and
      // offer Restart-or-Later when a build lands. Fail-closed everywhere else, and isolated
      // evidence launches (including packaged-startup probes) never touch the feed at all.
      if (!launchConfig.isolatedEvidence) {
        if (steamDistribution === steamworks.DISTRIBUTION_STEAM) {
          // PQ-033.03: Steam delivers Steam builds, so a Steam depot never self-updates from the
          // GitHub feed. Steam initializes eagerly instead, so achievements are live at the title.
          receipt('update-skipped', { reason: 'steam-distribution' });
          steamAdapter.init();
        } else {
          const update = configureAutoUpdate({
            appApi: app,
            receipt,
            dialogApi: dialog,
            browserWindowApi: BrowserWindow,
          });
          if (update && update.enabled === false) receipt('update-skipped', { reason: update.reason });
        }
      }
    })
    .catch(handleWindowCreationFailure);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void requestGameWindow();
    }
  });
}

module.exports.CRASH_REPORT_SCHEMA = CRASH_REPORT_SCHEMA;
module.exports.SAFE_GRAPHICS_FLAG = SAFE_GRAPHICS_FLAG;
module.exports.applyGpuHintSwitches = applyGpuHintSwitches;
module.exports.createRendererRecovery = createRendererRecovery;
module.exports.decideSafeGraphics = decideSafeGraphics;
module.exports.describeStartupFailure = describeStartupFailure;
module.exports.describeUnexpectedFailure = describeUnexpectedFailure;
module.exports.findRecentGpuFault = findRecentGpuFault;
module.exports.installCrashReportWriters = installCrashReportWriters;
module.exports.leftoverCrashDumpDir = leftoverCrashDumpDir;
module.exports.leftoverCrashExtra = leftoverCrashExtra;
module.exports.leftoverCrashIdentity = leftoverCrashIdentity;
module.exports.startLeftoverCrashReporter = startLeftoverCrashReporter;
module.exports.writeCrashReport = writeCrashReport;
