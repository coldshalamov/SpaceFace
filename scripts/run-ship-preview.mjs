// Starts the dev static server, launches the headless Electron ship-preview driver (which loads the
// app at ?dev=shippreview against that server), waits for it to capture all hull snapshots into
// .devshots/, then exits. Run: node scripts/run-ship-preview.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const PORT = '8123';
const server = spawn(process.execPath, ['server.js', PORT], { stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stderr.write('[server!] ' + d));

// wait briefly for the server to be listening before launching the browser
await new Promise((res) => setTimeout(res, 1500));

// Electron's binary: run our driver script as the main entry (electron/shipPreview.cjs) instead of
// the app's package.json main. The driver loads the app URL offscreen and waits for the snapshots.
const electronBin = require.resolve('electron/cli.js');
// `node scripts/run-ship-preview.mjs authored` (or SF_AUTHORED=1) renders the authored GLB-part
// hulls (the live-gameplay path) instead of the procedural fallback.
const authored = process.argv.includes('authored') || process.env.SF_AUTHORED === '1';
const previewUrl = `http://localhost:${PORT}/?dev=shippreview${authored ? '&authored=1' : ''}`;
const driver = spawn(process.execPath, [electronBin, 'electron/shipPreview.cjs'], {
  stdio: 'inherit',
  env: { ...process.env, SF_PREVIEW_URL: previewUrl },
});

driver.on('exit', (code) => {
  server.kill('SIGTERM');
  process.exit(code == null ? 1 : code);
});
