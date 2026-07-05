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
const path = require('path');
const { createGameServer } = require('../scripts/lib/gameServer.cjs');

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

// GPU hints (shell-only — must not change gameplay/renderer features).
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

function startServer() {
  return new Promise((resolve) => {
    const server = createGameServer({ root: ROOT, async: false });
    // Fixed port for a stable origin (save persistence). If it's busy (rare — another app, or a
    // stale instance the single-instance lock didn't catch), fall back to an ephemeral port so the
    // game still boots rather than crashing to a black window.
    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.warn('[electron] port ' + PORT + ' busy; using an ephemeral port (saves may not persist this run)');
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
      } else { throw err; }
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server.address().port));
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
  win.once('ready-to-show', () => win.show());
  // One player-facing launch URL: Electron and a browser tab both boot the same game route.
  // Release-only debug stripping is handled by the production bundle, not by a gameplay URL flag.
  win.loadURL(`http://127.0.0.1:${port}/`);
  // win.webContents.openDevTools();
}

// Single-instance lock: a second launch focuses the existing window instead of starting a rival
// server that would lose the fixed port (and split saves across origins).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
