// Headless Electron driver for the dev ship turntable preview (scripts/run-ship-preview.cjs helper).
// Loads the app with ?dev=shippreview against the local static server in an offscreen window so the
// page's WebGL renderer can build each ship mesh and POST snapshots to /__shot. Waits for the page
// to signal completion, then quits. Dev-only — never part of the packaged app.
const { app, BrowserWindow } = require('electron');

const URL = process.env.SF_PREVIEW_URL || 'http://localhost:8123/?dev=shippreview';
const TIMEOUT_MS = Number(process.env.SF_PREVIEW_TIMEOUT || 120000);

let done = false;
function finish(code) { if (!done) { done = true; app.exit(code); } }

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.disableHardwareAcceleration = false; // we NEED WebGL/GPU for the renderer

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  });
  // Hard timeout safety net so a stuck preview never hangs the process.
  setTimeout(() => { console.error('[shipPreview-driver] TIMEOUT'); finish(2); }, TIMEOUT_MS);

  // The page logs '[shipPreview] done — N shots' when finished; watch the console for it.
  win.webContents.on('console-message', (_e, level, message) => {
    console.log('[page]', message);
    if (String(message).includes('[shipPreview] done')) finish(0);
    if (String(message).includes('[shipPreview] BOOT') || String(message).includes('BOOT ERROR')) finish(3);
  });
  win.webContents.on('did-fail-load', (_e, code2, desc) => {
    console.error('[shipPreview-driver] did-fail-load', code2, desc); finish(4);
  });
  win.webContents.on('crashed', () => { console.error('[shipPreview-driver] crashed'); finish(5); });

  win.loadURL(URL).catch((err) => { console.error('[shipPreview-driver] loadURL failed', err); finish(6); });
});

app.on('window-all-closed', () => finish(0));
