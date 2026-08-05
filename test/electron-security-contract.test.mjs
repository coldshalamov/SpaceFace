import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');

test('Electron shell keeps an explicit secure renderer boundary', () => {
  const main = read('electron/main.cjs');
  for (const expected of [
    /contextIsolation:\s*true/,
    /nodeIntegration:\s*false/,
    /sandbox:\s*true/,
    /webSecurity:\s*true/,
    /allowRunningInsecureContent:\s*false/,
    /experimentalFeatures:\s*false/,
  ]) assert.match(main, expected);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /will-navigate/);
  assert.match(main, /setPermissionCheckHandler/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /permission !== 'pointerLock'/);
  assert.match(main, /webContents !== win\.webContents/);
  assert.match(main, /ELECTRON_CONTENT_SECURITY_POLICY/);
  assert.match(main, /staticHeaders:\s*\{\s*'Content-Security-Policy': ELECTRON_CONTENT_SECURITY_POLICY\s*\}/);
  const pageCsp = main.match(/const ELECTRON_CONTENT_SECURITY_POLICY = "([^"]+)"/)?.[1] || '';
  const workerCsp = main.match(/const ELECTRON_KTX2_WORKER_CONTENT_SECURITY_POLICY = "([^"]+)"/)?.[1] || '';
  assert.doesNotMatch(pageCsp, /script-src[^;]*'unsafe-eval'/i);
  assert.match(workerCsp, /script-src[^;]*'unsafe-eval'/i);
  assert.match(main, /staticHeadersByPath:[\s\S]*KTX2_TRANSCODER_WORKER_PATH[\s\S]*ELECTRON_KTX2_WORKER_CONTENT_SECURITY_POLICY/);
});

test('packaged Electron includes only production shell entry points', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.deepEqual(packageJson.build.files, [
    'build/web/**',
    'electron/main.cjs',
    'electron/preload.cjs',
    'scripts/lib/gameServer.cjs',
    'scripts/lib/electronLaunchProtocol.cjs',
    'package.json',
  ]);
  assert.equal(packageJson.build.files.includes('electron/**'), false);
});

test('sandboxed preload remains a one-way lifecycle subscription', () => {
  const preload = read('electron/preload.cjs');
  assert.match(preload, /contextBridge\.exposeInMainWorld\('spacefaceLifecycle'/);
  assert.match(preload, /ipcRenderer\.on\(SHELL_LIFECYCLE_CHANNEL/);
  assert.doesNotMatch(preload, /ipcRenderer\.(?:send|sendSync|invoke|postMessage)\s*\(/);
  assert.doesNotMatch(preload, /contextBridge\.exposeInMainWorld\([^)]*(?:ipcRenderer|require|process)/s);
});
