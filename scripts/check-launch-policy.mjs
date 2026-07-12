#!/usr/bin/env node
// Launch policy: enforces ONE player-facing game route across browser + Electron + packaged builds,
// and that the two HTTP launchers share a single source of truth (scripts/lib/gameServer.cjs)
// so they cannot drift on MIME types, freshness, or static-serving semantics.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditTimeScaleWriters, formatTimeScaleFindings } from './lib/timeScaleWriterAudit.mjs';

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
assert.match(shared, /__spaceface_health/, 'Shared server must expose the minimal shell liveness probe on both routes');
assert.match(shared, /devDiagnostics\s*=\s*opts\.devDiagnostics\s*!==\s*false/, 'Shared server must make dev diagnostics explicitly disableable');
assert.match(shared, /if \(devDiagnostics && method === 'GET' && url\.startsWith\('\/__dev_freshness'\)\)/,
  'Dev freshness must be gated off in packaged production');

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
  /createGameServer\(\s*\{\s*root,\s*async:\s*false,\s*devDiagnostics:\s*!app\.isPackaged\s*\}\s*\)/,
  'Electron main must build its server via createGameServer (not inline its own HTTP server)'
);
assert.match(electronMain, /const PORT = 41788;/, 'Electron must use the fixed packaged-app port so localStorage saves survive relaunches');
assert.match(
  electronMain,
  /resolveWebRoot\(\{\s*packaged:\s*app\.isPackaged,\s*projectRoot:\s*PROJECT_ROOT,\s*bundleRoot:\s*BUNDLE_ROOT\s*\}\)/,
  'Electron must resolve source in dev and fail closed if the packaged web root is incomplete'
);
assert.match(electronMain, /server\.listen\(PORT, '127\.0\.0\.1'/, 'Electron must try the fixed port before any fallback port');
assert.match(electronMain, /EADDRINUSE/, 'Electron must classify fixed-port contention without changing the save origin');
assert.match(electronMain, /package-invalid/, 'Electron must publish an actionable receipt for an incomplete packaged bundle');
assert.match(electronMain, /__spaceface_health/, 'Electron fixed-port ownership probe must work when dev diagnostics are stripped');
assert.doesNotMatch(electronMain, /path:\s*['"]\/__dev_freshness['"]/, 'Packaged instance detection must not depend on a dev-only endpoint');
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
assert.match(devServer, /devDiagnostics:\s*true/, 'Source browser server must explicitly enable dev diagnostics');
assert.match(devServer, /__dev_freshness|extraRoutes/, 'Browser server may keep its /__dev_freshness + /__shot routes via extraRoutes');
assert.doesNotMatch(
  devServer,
  /'\.glb'\s*:\s*'model|const MIME\s*=\s*\{|function maxMtimeMs/,
  'Browser server must NOT inline its own MIME table or freshness logic — it must come from the shared module'
);

const browserLauncher = read('SpaceFace.bat');
assert.match(browserLauncher, /node scripts\\launch-browser\.mjs/, 'Browser .bat must use the robust launcher helper');
assert.doesNotMatch(
  browserLauncher,
  /start\s+""\s+"http:\/\/localhost:8123\/"[\s\S]*node server\.js/,
  'Browser .bat must not open the browser before proving the server is ready'
);

const browserLauncherHelper = read('scripts/launch-browser.mjs');
assert.match(browserLauncherHelper, /probeSpaceFace/, 'Browser launcher helper must probe the route before opening the browser');
assert.match(browserLauncherHelper, /SpaceFace is already running/, 'Browser launcher helper must reuse an existing healthy SpaceFace server');
assert.match(browserLauncherHelper, /waitForSpaceFace/, 'Browser launcher helper must wait for readiness after starting the server');

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
assert.match(main, /typeof __SPACEFACE_PRODUCTION__ !== 'undefined'/,
  'Boot debug policy must expose a compile-time production branch that release bundling can remove');
assert.match(main, /SF_DEBUG_ONLY:\s*if \(SF_DEBUG\)/,
  'Public debug handles and query tools must be explicitly removable from the production bundle');
assert.ok(
  main.indexOf('createTimeEffects(state)') < main.indexOf('createRegistry(ctx)'),
  'Boot must create the sole time-effects owner before registry initialization'
);
assert.match(main, /runtime:boot-menu/, 'Boot menu must use a named time-effects request');
assert.match(main, /runtime:loading/, 'Loading must use a named time-effects request');
assert.match(main, /runtime:start-failed/, 'Startup failure must use a named time-effects request');
assert.match(main, /const runTransitionGuard\s*=\s*createRunTransitionGuard\(\);/,
  'Browser/Electron must share one run-transition generation owner');
assert.match(main, /helpers\.beginLoadedGameTransition\s*=\s*\(\)\s*=>\s*runTransitionGuard\.begin\('load'\);/,
  'Save restore must reserve async route ownership before lifecycle events can reenter');
assert.match(
  main,
  /bus\.on\('game:new',[\s\S]*const startNewGameTransition\s*=\s*\(\)\s*=>\s*\{[\s\S]*runTransitionGuard\.begin\('new-game'\)[\s\S]*registry\.get\('save'\)[\s\S]*deferRunTransition\(startNewGameTransition\)[\s\S]*startNewGameTransition\(\)/,
  'New Game must defer its entire generation/start operation while destructive save restore owns the route',
);
assert.match(
  main,
  /helpers\.finalizeLoadedGame\s*=\s*\(payload\)\s*=>\s*finalizeLoadedGame\(\s*state,\s*bus,\s*registry,\s*runTransitionGuard,\s*payload\s*\|\|\s*\{\},?\s*\);/,
  'Browser/Electron save-load must use the same authored visual gate before returning to flight'
);
assert.match(
  main,
  /async function finalizeLoadedGame[\s\S]*waitForAuthoredPartLibrary[\s\S]*waitForInitialAuthoredVisuals[\s\S]*enterFlightMode/,
  'Loaded games must wait for release-authored assets and live authored visuals before entering flight'
);
assert.match(
  main,
  /catch \(error\)[\s\S]*failGameStart\([^;]+;[\s\S]*throw error;/,
  'Loaded visual-gate failures must surface to the player and rethrow so save can release its source'
);

const indexHtml = read('index.html');
assert.doesNotMatch(
  indexHtml,
  /setInterval\([\s\S]*location\.reload|\/__dev_freshness[\s\S]*location\.reload/,
  'Browser dev page must not auto-reload the game while agents are editing files'
);

const bundle = read('scripts/build-bundle.mjs');
assert.doesNotMatch(bundle, /\?prod=1/, 'Bundle policy must not refer to prod query flags');
assert.match(bundle, /RELEASE_COPY_MAPPINGS/, 'Production bundle must copy runtime roots from the deterministic release map');
assert.match(bundle, /writeReleaseBuildReceipt/, 'Production bundle must emit a deterministic hash-bound receipt');
assert.match(bundle, /__SPACEFACE_PRODUCTION__:\s*'true'/,
  'Production bundle must compile out public debug routes instead of relying on a launcher query flag');
assert.match(bundle, /dropLabels:\s*\['SF_DEBUG_ONLY'\]/,
  'Production bundle must remove labeled public debug statements and their dynamic imports');
assert.doesNotMatch(bundle, /copyDir\(join\(ROOT, 'assets', 'ships'\)/,
  'Production bundle must not ship Blender sources/evidence by copying the entire ship authoring tree');

const packageJson = JSON.parse(read('package.json'));
const packageFiles = (((packageJson || {}).build || {}).files || []).map(normalizeRel);
for (const assetRoot of ['assets/cinematics', 'assets/ui', 'assets/ships']) {
  assert.ok(!isPackagedRoot(assetRoot, packageFiles),
    `Electron package must not duplicate ${assetRoot}/** outside the canonical build/web payload`);
}
assert.ok(isPackagedRoot('build/web', packageFiles), 'Electron package files must include the canonical build/web payload');

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
  /state\.mode\s*=\s*finalizeLoadedGame\s*\?\s*'loading'\s*:\s*'flight';/s,
  'Save restore must stay in loading when the runtime has an authored visual finalizer'
);
assert.match(saveSystem, /save:restore:\$\{this\._restoreSequence\}/,
  'Each save restore must own a unique time-effects source');
assert.match(
  saveSystem,
  /deferRunTransition\(callback\)[\s\S]*if \(!this\._restoring\) return false;[\s\S]*this\._pendingRunTransition = callback;/,
  'Save restore must expose one latest-wins transition deferral slot',
);
const restoreEntry = saveSystem.indexOf('_restore(data, slot, options = {})');
const nestedRestoreGuard = saveSystem.indexOf('if (this._restoring)', restoreEntry);
const loadTokenReservation = saveSystem.indexOf('beginLoadedGameTransition', restoreEntry);
assert.ok(restoreEntry >= 0 && nestedRestoreGuard > restoreEntry && nestedRestoreGuard < loadTokenReservation,
  'Nested restore must queue before reserving a token, emitting lifecycle events, or mutating state');
assert.match(saveSystem, /this\.bus\.emit\('save:restoring'/,
  'Validated destructive restore must announce its transient reset boundary');
assert.ok(
  saveSystem.indexOf('beginLoadedGameTransition') < saveSystem.indexOf("this.bus.emit('save:restoring'"),
  'Save restore must reserve its transition token before save:restoring can start a newer route',
);
assert.match(saveSystem, /transitionToken\s*\?\s*\{\s*slot,\s*transitionToken\s*\}\s*:\s*\{\s*slot\s*\}/,
  'Save restore must carry its reserved token into the authored-visual finalizer');
assert.match(
  saveSystem,
  /const pendingRunTransition\s*=\s*this\._pendingRunTransition;[\s\S]*this\._pendingRunTransition\s*=\s*null;[\s\S]*this\._restoring\s*=\s*false;[\s\S]*pendingRunTransition\(\)/,
  'Save restore must release synchronous ownership before draining exactly the latest route',
);
assert.match(
  saveSystem,
  /this\.bus\.emit\('save:loaded',\s*\{\s*slot,\s*visualGatePending:\s*!!finalizeLoadedGame,/s,
  'save:loaded must expose whether playable flight is waiting on authored visual readiness'
);

const timeScaleWriters = auditTimeScaleWriters(ROOT);
assert.deepEqual(timeScaleWriters, [],
  `Only core/timeEffects.js may mutate timeScale:\n${formatTimeScaleFindings(timeScaleWriters)}`);

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
