// Electron desktop shell for SpaceFace (Steam-ready).
// Serves the app from a tiny in-process static server on a FIXED localhost port so ES modules +
// the importmap load exactly as they do in a browser, then opens a frameless game window.
//
// The HTTP core (MIME table, dev-freshness, static serving, containment check) lives in
// scripts/lib/gameServer.cjs and is SHARED with server.js so the two launchers can never drift.
// This file is the Electron-only shell: app lifecycle, single-instance lock, GPU switches,
// window creation, fixed-port-for-saves, packaged→bundle root selection.
// `npm run check:launch-policy` enforces that both launchers share that module.
const { app, BrowserWindow, powerMonitor } = require('electron');
const http = require('http');
const path = require('path');
const { createGameServer } = require('../scripts/lib/gameServer.cjs');
const {
  appendLaunchReceipt,
  isAllowedElectronListenerPort,
  isAssetPreloadFailureMessage,
  resolveElectronLaunchConfig,
  resolveWebRoot,
} = require('../scripts/lib/electronLaunchProtocol.cjs');

// WEB ROOT: packaged desktop serves the bundled release output in build/web/. Electron dev serves
// the project root so `npm run electron` and `node server.js 8123` run the same source route even
// when a stale build/web directory exists from an earlier package build.
const PROJECT_ROOT = path.join(__dirname, '..');
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
// Player windows use normal Chromium throttling. A temporary evidence profile may opt out only
// through the explicit dual gate; the environment variable alone has no effect on normal play.
const allowEvidenceBackgroundExecution = launchConfig.isolatedEvidence === true
  && process.env.SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION === '1';
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

app.on('before-quit', () => { appQuitting = true; });

// Explicit evidence probes use a temporary Chromium profile. Electron's single-instance lock is
// scoped by userData, so applying this before requestSingleInstanceLock gives the probe its own
// lock namespace and keeps player saves/preferences untouched. Normal launches never call setPath.
if (launchConfig.isolatedEvidence) {
  app.setPath('userData', launchConfig.userDataDir);
}

// GPU hints (shell-only — must not change gameplay/renderer features).
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

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
      if (err && err.code === 'EADDRINUSE') {
        const owner = await probeSpaceFacePort(requestedPort) ? 'spaceface' : 'other';
        receipt('port-conflict', { owner, port: requestedPort, message: err.message });
      }
      reject(err);
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

function probeSpaceFacePort(port) {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/__spaceface_health', timeout: 1000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          const health = JSON.parse(body);
          resolve(response.statusCode === 200 && health.app === 'SpaceFace' && health.route === '/');
        }
        catch { resolve(false); }
      });
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

function systemLifecycleSuspended() {
  return powerSuspended || screenLocked;
}

function deriveWindowLifecycleState(win) {
  if (systemLifecycleSuspended()) return 'system-suspended';
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

function receiptText(value) {
  return String(value || '').slice(0, 500);
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

async function createWindow() {
  installPowerLifecycleListeners();
  // macOS keeps the application process alive after the last window closes. Reuse the one
  // process-owned fixed-origin listener when Dock activation creates a replacement window; a
  // second bind would collide with our own server and strand the player without a window.
  const port = await ensureGameServerPort();
  const win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1024, minHeight: 640,
    backgroundColor: '#05070d', title: 'SpaceFace', show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling,
    },
  });
  const gameUrl = `http://127.0.0.1:${port}/`;
  installWindowSecurity(win, gameUrl);
  bindWindowLifecycle(win);
  win.removeMenu();
  win.once('ready-to-show', () => {
    receipt('window-ready', {
      port,
      backgroundThrottling,
      evidenceBackgroundOverride: allowEvidenceBackgroundExecution,
    });
    win.show();
  });
  win.webContents.on('did-fail-load', (_event, code, message, url, isMainFrame) => {
    if (!isMainFrame) return;
    receipt('navigation-failed', { code, message, url });
  });
  win.webContents.on('console-message', (details) => {
    const message = details && details.message;
    if (isAssetPreloadFailureMessage(message)) {
      receipt('asset-preload-failed', { message: receiptText(message) });
    }
  });
  // One player-facing launch URL: Electron and a browser tab both boot the same game route.
  // Release-only debug stripping is handled by the production bundle, not by a gameplay URL flag.
  await win.loadURL(gameUrl);
  // win.webContents.openDevTools();
}

function handleWindowCreationFailure(error) {
  receipt('startup-failed', { code: error && error.code, message: error && error.message ? error.message : String(error) });
  console.error('[electron] desktop startup failed:', error);
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

// Single-instance lock: a second launch focuses the existing window instead of starting a rival
// server that would lose the fixed port (and split saves across origins).
if (!app.requestSingleInstanceLock()) {
  receipt('existing-instance');
  app.quit();
} else {
  receipt('starting', {
    port: launchPort,
    isolatedEvidence: launchConfig.isolatedEvidence,
    lockNamespace: launchConfig.lockNamespace,
    backgroundThrottling,
    evidenceBackgroundOverride: allowEvidenceBackgroundExecution,
    runtime: collectRuntimeIdentity(),
  });
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
    .then(() => { void requestGameWindow(); })
    .catch(handleWindowCreationFailure);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void requestGameWindow();
    }
  });
}
