// Electron desktop shell for SpaceFace (Steam-ready).
// Serves the app from a tiny in-process static server on a FIXED localhost port so ES modules +
// the importmap load exactly as they do in a browser, then opens a frameless game window.
//
// SAVE PERSISTENCE: the port MUST be fixed. localStorage (where saveSystem.js persists) is keyed by
// origin = scheme://host:port. A random port (listen(0)) changes the origin every launch, so every
// prior save becomes invisible. A fixed port keeps the origin stable across relaunches → saves persist.
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// WEB ROOT: the bundled release ships minified, tree-shoken output in build/web/ (produced by
// `npm run build:bundle` / `npm run dist`). When that exists, serve IT (smaller, faster, no raw
// source shipped). When it doesn't (dev: `npm run electron` without a build), fall back to the
// project root so the raw ES modules + importmap load as in a browser — the zero-build dev path.
const PROJECT_ROOT = path.join(__dirname, '..');
const BUNDLE_ROOT = path.join(PROJECT_ROOT, 'build', 'web');
const ROOT = fs.existsSync(path.join(BUNDLE_ROOT, 'index.html')) ? BUNDLE_ROOT : PROJECT_ROOT;
// Dedicated fixed port for the packaged app (distinct from the dev server's 8123 so both can run).
const PORT = 41788;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.ico': 'image/x-icon', '.map': 'application/json; charset=utf-8',
};

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/' || p === '') p = '/index.html';
      const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
      const file = path.join(ROOT, safe);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('404 ' + safe); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    // Fixed port for a stable origin (save persistence). If it's busy (rare — another app, or a stale
    // instance the single-instance lock didn't catch), fall back to an ephemeral port so the game still
    // boots rather than crashing to a black window.
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
