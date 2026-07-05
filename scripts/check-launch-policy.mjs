#!/usr/bin/env node
// Launch policy: enforces ONE player-facing game route across browser + Electron + packaged builds,
// and that the two HTTP launchers share a single source of truth (scripts/lib/gameServer.cjs)
// so they cannot drift on MIME types, freshness, or static-serving semantics.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SERVER MODULE — the single source of truth both launchers must use.
// ─────────────────────────────────────────────────────────────────────────────
const sharedPath = 'scripts/lib/gameServer.cjs';
assert.ok(existsSync(join(ROOT, sharedPath)), `Shared server module ${sharedPath} must exist`);
const shared = read(sharedPath);

// Policy-relevant behavior MUST live in the shared module (not duplicated inline).
assert.match(shared, /'\.glb':\s*'model\/gltf-binary'/, 'Shared MIME table must serve release-authored GLB ship assets as model/gltf-binary');
assert.match(shared, /'\.gltf':\s*'model\/gltf\+json; charset=utf-8'/, 'Shared MIME table must serve GLTF JSON assets correctly');
assert.match(shared, /'\.ktx2':\s*'image\/ktx2'/, 'Shared MIME table must serve KTX2 textures');
assert.match(shared, /'Cache-Control':\s*'no-cache'/, 'Shared static server must keep no-cache semantics');
assert.match(shared, /function isInsideRoot/, 'Shared static server must resolve filesystem containment before serving files');
assert.match(shared, /isDirectory\(\)\) file = path\.join\(file, 'index\.html'\)/, 'Shared static server must support directory index fallback');
assert.match(shared, /const DEV_FRESHNESS_ROOTS = Object\.freeze\(\['index\.html', 'src', 'styles'\]\)/, 'Dev freshness should watch source/UI roots without scanning large asset/build directories');
assert.match(shared, /module\.exports\s*=\s*{[\s\S]*MIME[\s\S]*createGameServer/, 'Shared module must export MIME + createGameServer');

// ─────────────────────────────────────────────────────────────────────────────
// ELECTRON MAIN — must wire the shared module, keep the fixed port + save-origin rules.
// ─────────────────────────────────────────────────────────────────────────────
const electronMain = read('electron/main.cjs');
assert.match(
  electronMain,
  /require\(['"]\.\.\/scripts\/lib\/gameServer\.cjs['"]\)/,
  'Electron main must require the shared gameServer module (single source of truth for serving)'
);
assert.match(electronMain, /const \{ createGameServer \}/, 'Electron main must destructure createGameServer from the shared module');
assert.match(
  electronMain,
  /createGameServer\(\s*\{\s*root:\s*ROOT,\s*async:\s*false\s*\}\s*\)/,
  'Electron main must build its server via createGameServer (not inline its own HTTP server)'
);
assert.match(electronMain, /const PORT = 41788;/, 'Electron must use the fixed packaged-app port so localStorage saves survive relaunches');
assert.match(
  electronMain,
  /const ROOT = app\.isPackaged && fs\.existsSync\(path\.join\(BUNDLE_ROOT, 'index\.html'\)\) \? BUNDLE_ROOT : PROJECT_ROOT;/,
  'Electron dev must serve PROJECT_ROOT so stale build/web output cannot diverge from browser play'
);
assert.match(electronMain, /server\.listen\(PORT, '127\.0\.0\.1'/, 'Electron must try the fixed port before any fallback port');
assert.match(electronMain, /EADDRINUSE/, 'Electron must fall back to an ephemeral port only if the fixed port is busy (not crash)');
assert.doesNotMatch(
  electronMain,
  /'\.glb'\s*:\s*'model|'\.ktx2'\s*:\s*'image|const MIME\s*=/,
  'Electron main must NOT inline its own MIME table — it must come from the shared module'
);
assert.doesNotMatch(
  electronMain,
  /function isInsideRoot|maxMtimeMsSync\(file\)\s*\{/,
  'Electron main must NOT inline serving/freshness logic — it must come from the shared module'
);
assert.doesNotMatch(electronMain, /location\.reload|webContents\.reload|__dev_auto_refresh/, 'Electron dev must not auto-reload the game while agents are editing files');
const electronLoadUrlLine = electronMain.split(/\r?\n/).find((line) => line.includes('win.loadURL')) || '';
assert.ok(electronLoadUrlLine.includes('http://127.0.0.1:${port}/`'), 'Electron must load the canonical root game URL');
assert.doesNotMatch(electronLoadUrlLine, /\?|prod=1|release=1|debug=|dev=/, 'Electron must not inject mode/query flags into the normal game launch URL');

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER SERVER — must also wire the shared module (ESM via createRequire).
// ─────────────────────────────────────────────────────────────────────────────
const devServer = read('server.js');
assert.match(
  devServer,
  /require\(['"]\.\/scripts\/lib\/gameServer\.cjs['"]\)/,
  'Browser server must require the shared gameServer module via createRequire (single source of truth)'
);
assert.match(devServer, /createGameServer\(\s*\{\s*root:\s*ROOT,[\s\S]*async:\s*true/, 'Browser server must build its server via createGameServer (async mode)');
assert.match(devServer, /__dev_freshness|extraRoutes/, 'Browser server may keep its /__dev_freshness + /__shot routes via extraRoutes');
assert.doesNotMatch(
  devServer,
  /'\.glb'\s*:\s*'model|const MIME\s*=\s*\{|function maxMtimeMs/,
  'Browser server must NOT inline its own MIME table or freshness logic — it must come from the shared module'
);

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME — backend defaults, asset mode, save canonicalization, no URL forks.
// ─────────────────────────────────────────────────────────────────────────────
const releaseMode = read('src/render/releaseMode.js');
assert.doesNotMatch(
  releaseMode,
  /URLSearchParams|location\.search|NODE_ENV|SPACEFACE_RELEASE|__SPACEFACE_RELEASE__/,
  'Player-facing asset mode must not depend on launcher URL, environment, or globals'
);
assert.match(
  releaseMode,
  /if \(typeof options\.releaseMode === 'boolean'\) return options\.releaseMode;\s*return true;/s,
  'Normal play must default to release-authored assets; source assets require an explicit tool/test option'
);

const main = read('src/main.js');
assert.doesNotMatch(main, /prod=1|get\('prod'\)|\?prod/, 'Boot/debug policy must not use a prod query flag to fork the runtime');
assert.match(
  main,
  /helpers\.finalizeLoadedGame\s*=\s*\(payload\)\s*=>\s*finalizeLoadedGame\(state,\s*bus,\s*payload\s*\|\|\s*\{\}\);/,
  'Browser/Electron save-load must use the same authored visual gate before returning to flight'
);
assert.match(
  main,
  /async function finalizeLoadedGame[\s\S]*waitForAuthoredPartLibrary[\s\S]*waitForInitialAuthoredVisuals[\s\S]*enterFlightMode/,
  'Loaded games must wait for release-authored assets and live authored visuals before entering flight'
);

const indexHtml = read('index.html');
assert.doesNotMatch(
  indexHtml,
  /setInterval\([\s\S]*location\.reload|\/__dev_freshness[\s\S]*location\.reload/,
  'Browser dev page must not auto-reload the game while agents are editing files'
);

const bundle = read('scripts/build-bundle.mjs');
assert.doesNotMatch(bundle, /\?prod=1/, 'Bundle policy must not refer to prod query flags');
assert.match(bundle, /assets', 'ui'[\s\S]*assets', 'ships'/, 'Production bundle must copy player-facing UI art beside ship/cinematic assets');

const packageJson = JSON.parse(read('package.json'));
const packageFiles = (((packageJson || {}).build || {}).files || []).map(normalizeRel);
for (const assetRoot of ['assets/cinematics', 'assets/ui', 'assets/ships']) {
  assert.ok(isPackagedRoot(assetRoot, packageFiles), `Electron package files must include ${assetRoot}/** for player-facing release assets`);
}

const gameState = read('src/core/gameState.js');
assert.match(
  gameState,
  /gameplay:\s*\{[^}]*physicsBackend:\s*'rapier-dynamic'[^}]*aiBackend:\s*'sg06-tactical'[^}]*flightBackend:\s*'v3'[^}]*\}/s,
  'Default game state must boot the canonical physics, AI, and flight backends'
);

const settingsScreen = read('src/ui/screens/settings.js');
for (const label of ['Physics backend', 'Flight controller', 'AI backend']) {
  assert.doesNotMatch(settingsScreen, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Settings must not expose player-facing ${label} runtime forks`);
}
for (const option of ['Custom Controller (legacy)', 'Legacy FSM', 'Rapier Observer']) {
  assert.doesNotMatch(settingsScreen, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Settings must not expose ${option} as a normal play option`);
}

const saveSystem = read('src/save/saveSystem.js');
assert.match(
  saveSystem,
  /s\.gameplay\.physicsBackend\s*=\s*DEFAULT_PHYSICS_BACKEND;\s*s\.gameplay\.aiBackend\s*=\s*DEFAULT_AI_BACKEND;\s*s\.gameplay\.flightBackend\s*=\s*DEFAULT_FLIGHT_BACKEND;/s,
  'Save restore must canonicalize backend fields instead of preserving launcher/player forks'
);
assert.match(
  saveSystem,
  /state\.mode\s*=\s*finalizeLoadedGame\s*\?\s*'loading'\s*:\s*'flight';\s*state\.timeScale\s*=\s*finalizeLoadedGame\s*\?\s*0\s*:\s*1;/s,
  'Save restore must stay in loading when the runtime has an authored visual finalizer'
);
assert.match(
  saveSystem,
  /this\.bus\.emit\('save:loaded',\s*\{\s*slot,\s*visualGatePending:\s*!!finalizeLoadedGame\s*\}\);/s,
  'save:loaded must expose whether playable flight is waiting on authored visual readiness'
);

console.log('Launch policy OK: one player URL, one shared server module (browser + Electron), stable Electron save origin, release-authored default assets, canonical runtime backends, no prod query fork.');

function isPackagedRoot(root, patterns) {
  const relRoot = normalizeRel(root);
  return patterns.some((pattern) => {
    const p = normalizeRel(pattern);
    if (p === 'assets/**' || p === 'assets/**/*' || p === `${relRoot}/**` || p === `${relRoot}/**/*`) return true;
    if (p.endsWith('/**') && relRoot.startsWith(`${p.slice(0, -3)}/`)) return true;
    if (p.endsWith('/**/*') && relRoot.startsWith(`${p.slice(0, -5)}/`)) return true;
    return false;
  });
}

function normalizeRel(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}
