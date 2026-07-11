// Electron desktop shell for SpaceFace (Steam-ready).
// Serves the app from a tiny in-process static server on a FIXED localhost port so ES modules +
// the importmap load exactly as they do in a browser, then opens a frameless game window.
//
// The HTTP core (MIME table, dev-freshness, static serving, containment check) lives in
// scripts/lib/gameServer.cjs and is SHARED with server.js so the two launchers can never drift.
// This file is the Electron-only shell: app lifecycle, single-instance lock, GPU switches,
// window creation, fixed-port-for-saves, packaged→bundle root selection.
// `npm run check:launch-policy` enforces that both launchers share that module.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createGameServer } = require('../scripts/lib/gameServer.cjs');
const { appendLaunchReceipt, isAssetPreloadFailureMessage } = require('../scripts/lib/electronLaunchProtocol.cjs');

// WEB ROOT: packaged desktop serves the bundled release output in build/web/. Electron dev serves
// the project root so `npm run electron` and `node server.js 8123` run the same source route even
// when a stale build/web directory exists from an earlier package build.
const PROJECT_ROOT = path.join(__dirname, '..');
const BUNDLE_ROOT = path.join(PROJECT_ROOT, 'build', 'web');
const ROOT = app.isPackaged && fs.existsSync(path.join(BUNDLE_ROOT, 'index.html')) ? BUNDLE_ROOT : PROJECT_ROOT;

// SAVE PERSISTENCE: the port MUST be fixed. localStorage (where saveSystem.js persists) is keyed by
// origin = scheme://host:port. A random port (listen(0)) changes the origin every launch, so every
// prior save becomes invisible. A fixed port keeps the origin stable across relaunches → saves persist.
const PORT = 41788;
const RECEIPT_PATH = process.env.SPACEFACE_LAUNCH_RECEIPT || '';
const receipt = (status, details = {}) => appendLaunchReceipt(RECEIPT_PATH, status, details);

// GPU hints (shell-only — must not change gameplay/renderer features).
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createGameServer({ root: ROOT, async: false });
    // Keep the fixed origin authoritative. An ephemeral fallback hides the actual port owner and
    // makes existing localStorage saves disappear for the run, so classify contention instead.
    server.once('error', async (err) => {
      if (err && err.code === 'EADDRINUSE') {
        const owner = await probeSpaceFacePort(PORT) ? 'spaceface' : 'other';
        receipt('port-conflict', { owner, port: PORT, message: err.message });
      }
      reject(err);
    });
    server.listen(PORT, '127.0.0.1', () => {
      receipt('server-ready', { port: PORT });
      resolve(PORT);
    });
  });
}

function probeSpaceFacePort(port) {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/__dev_freshness', timeout: 1000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve(response.statusCode === 200 && JSON.parse(body).dev === true); }
        catch { resolve(false); }
      });
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

async function createWindow() {
  const port = await startServer();
  const win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1024, minHeight: 640,
    backgroundColor: '#05070d', title: 'SpaceFace', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.removeMenu();
  win.once('ready-to-show', () => {
    receipt('window-ready', { port });
    win.show();
  });
  win.webContents.on('did-fail-load', (_event, code, message, url, isMainFrame) => {
    if (!isMainFrame) return;
    receipt('navigation-failed', { code, message, url });
  });
  win.webContents.on('console-message', (_event, _level, message) => {
    if (isAssetPreloadFailureMessage(message)) {
      receipt('asset-preload-failed', { message: String(message).slice(0, 500) });
    }
  });
  // One player-facing launch URL: Electron and a browser tab both boot the same game route.
  // Release-only debug stripping is handled by the production bundle, not by a gameplay URL flag.
  await win.loadURL(`http://127.0.0.1:${port}/`);
  // win.webContents.openDevTools();
}

// Single-instance lock: a second launch focuses the existing window instead of starting a rival
// server that would lose the fixed port (and split saves across origins).
if (!app.requestSingleInstanceLock()) {
  receipt('existing-instance');
  app.quit();
} else {
  receipt('starting', { port: PORT });
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(createWindow).catch((error) => {
    receipt('startup-failed', { code: error && error.code, message: error && error.message ? error.message : String(error) });
    console.error('[electron] desktop startup failed:', error);
    app.exit(1);
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
