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
    'assets/brand/exports/spaceface-launcher-256.png',
    'assets/brand/exports/spaceface.ico',
    'electron/main.cjs',
    'electron/preload.cjs',
    'electron/autoUpdate.cjs',
    'electron/releaseIdentity.cjs',
    'electron/workshopMods.cjs',
    'electron/windowState.cjs',
    'electron/steamworks.cjs',
    'electron/steamAchievements.json',
    'scripts/lib/gameServer.cjs',
    'scripts/lib/electronLaunchProtocol.cjs',
    'scripts/lib/playerSaveStore.cjs',
    'scripts/lib/userContentStore.cjs',
    'scripts/lib/staticCachePolicy.cjs',
    'package.json',
    'NOTICE',
  ]);
  assert.equal(packageJson.build.files.includes('electron/**'), false);
});

test('packaged Electron ships the relative require closure of main.cjs', () => {
  const packageJson = JSON.parse(read('package.json'));
  const files = new Set(packageJson.build.files);
  const queue = ['electron/main.cjs'];
  const seen = new Set();
  const requireRe = /require\((['"])(\.\.?\/[^'"]+)\1\)/g;
  while (queue.length) {
    const rel = queue.pop().replace(/\\/g, '/');
    if (seen.has(rel)) continue;
    seen.add(rel);
    assert.equal(files.has(rel), true, `packaged files must include ${rel}`);
    if (!/\.(cjs|js)$/.test(rel)) continue;
    const source = read(rel);
    requireRe.lastIndex = 0;
    let match;
    while ((match = requireRe.exec(source))) {
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(rel), match[2]));
      if (next.startsWith('..')) continue;
      queue.push(next);
    }
  }
});

test('sandboxed preload remains a one-way lifecycle subscription', () => {
  const preload = read('electron/preload.cjs');
  assert.match(preload, /contextBridge\.exposeInMainWorld\('spacefaceLifecycle'/);
  assert.match(preload, /ipcRenderer\.on\(SHELL_LIFECYCLE_CHANNEL/);
  assert.match(preload, /const SHELL_QUIT_CHANNEL\s*=\s*['"]spaceface:quit['"]/);
  // Every outbound call by its channel constant - including the payload-carrying ones (achievement unlock,
  // workshop publish, window-mode set), which a single-argument pattern would not see.
  const outboundIpcCalls = [...preload.matchAll(
    /ipcRenderer\.(send|sendSync|invoke|postMessage)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/g,
  )].map(([, method, argument]) => [method, argument.trim()]);
  // The documented quit channel (fire-and-forget) plus request-response queries: build identity, Steam status and
  // achievement unlock (known id only), workshop status / publish (a mod id string, <= 80 chars; the shell resolves the
  // directory) / sync, perf metrics, the window mode get/set (the sender's own window, three allowed words,
  // validated again by applyWindowMode), and save-clip (basename only, .gif/.mp4, 24 MB cap, destination chosen by
  // the player in a native save dialog). Every channel is a named constant; any new one must be added here on review.
  assert.deepEqual(outboundIpcCalls, [
    ['send', 'SHELL_QUIT_CHANNEL'],
    ['send', 'SHELL_QUIT_CHANNEL'],
    ['invoke', 'SHELL_SAVE_CLIP_CHANNEL'],
    ['invoke', 'SHELL_BUILD_INFO_CHANNEL'],
    ['invoke', 'SHELL_ACHIEVEMENT_UNLOCK_CHANNEL'],
    ['invoke', 'SHELL_STEAM_STATUS_CHANNEL'],
    ['invoke', 'SHELL_WORKSHOP_STATUS_CHANNEL'],
    ['invoke', 'SHELL_WORKSHOP_PUBLISH_CHANNEL'],
    ['invoke', 'SHELL_WORKSHOP_SYNC_CHANNEL'],
    ['invoke', 'SHELL_PERF_METRICS_CHANNEL'],
    ['invoke', 'SHELL_WINDOW_MODE_GET'],
    ['invoke', 'SHELL_WINDOW_MODE_SET'],
    ['send', 'SHELL_QUIT_CHANNEL'],
], 'preload may only send the quit channel and invoke the reviewed status channels');
  assert.doesNotMatch(preload, /contextBridge\.exposeInMainWorld\([^)]*(?:ipcRenderer|require|process)/s);
});
