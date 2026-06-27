#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const electronMain = read('electron/main.cjs');
const electronLoadUrlLine = electronMain.split(/\r?\n/).find((line) => line.includes('win.loadURL')) || '';
assert.ok(
  electronLoadUrlLine.includes('http://127.0.0.1:${port}/`'),
  'Electron must load the canonical root game URL'
);
assert.doesNotMatch(
  electronLoadUrlLine,
  /\?|prod=1|release=1|debug=|dev=/,
  'Electron must not inject mode/query flags into the normal game launch URL'
);
assert.match(
  electronMain,
  /const PORT = 41788;/,
  'Electron must use the fixed packaged-app port so localStorage saves survive relaunches'
);
assert.match(
  electronMain,
  /server\.listen\(PORT, '127\.0\.0\.1'/,
  'Electron must try the fixed port before any fallback port'
);
assert.match(
  electronMain,
  /'\.glb': 'model\/gltf-binary'/,
  'Electron MIME table must serve release-authored GLB ship assets as model/gltf-binary'
);
assert.match(
  electronMain,
  /'\.gltf': 'model\/gltf\+json; charset=utf-8'/,
  'Electron MIME table must serve GLTF JSON assets consistently with the dev server'
);
assert.match(
  electronMain,
  /'\.ktx2': 'image\/ktx2'/,
  'Electron MIME table must serve KTX2 textures consistently with the dev server'
);
assert.match(
  electronMain,
  /'Cache-Control': 'no-cache'/,
  'Electron static server must keep no-cache semantics like the browser dev server'
);
assert.match(
  electronMain,
  /function isInsideRoot\(file\)[\s\S]*path\.resolve\(file\)[\s\S]*RESOLVED_ROOT/,
  'Electron static server must resolve filesystem containment before serving files'
);
assert.match(
  electronMain,
  /stats\.isDirectory\(\).*index\.html/s,
  'Electron static server must support directory index fallback like the browser dev server'
);

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
assert.doesNotMatch(
  main,
  /prod=1|get\('prod'\)|\?prod/,
  'Boot/debug policy must not use a prod query flag to fork the runtime'
);
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

const bundle = read('scripts/build-bundle.mjs');
assert.doesNotMatch(
  bundle,
  /\?prod=1/,
  'Bundle policy must not refer to prod query flags'
);
assert.match(
  bundle,
  /assets', 'ui'[\s\S]*assets', 'ships'/,
  'Production bundle must copy player-facing UI art beside ship/cinematic assets'
);

const packageJson = JSON.parse(read('package.json'));
const packageFiles = (((packageJson || {}).build || {}).files || []).map(normalizeRel);
for (const assetRoot of ['assets/cinematics', 'assets/ui', 'assets/ships']) {
  assert.ok(
    isPackagedRoot(assetRoot, packageFiles),
    `Electron package files must include ${assetRoot}/** for player-facing release assets`
  );
}

const gameState = read('src/core/gameState.js');
assert.match(
  gameState,
  /gameplay:\s*\{[^}]*physicsBackend:\s*'rapier-dynamic'[^}]*aiBackend:\s*'sg06-tactical'[^}]*flightBackend:\s*'v3'[^}]*\}/s,
  'Default game state must boot the canonical physics, AI, and flight backends'
);

const settingsScreen = read('src/ui/screens/settings.js');
for (const label of ['Physics backend', 'Flight controller', 'AI backend']) {
  assert.doesNotMatch(
    settingsScreen,
    new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `Settings must not expose player-facing ${label} runtime forks`
  );
}
for (const option of ['Custom Controller (legacy)', 'Legacy FSM', 'Rapier Observer']) {
  assert.doesNotMatch(
    settingsScreen,
    new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `Settings must not expose ${option} as a normal play option`
  );
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

console.log('Launch policy OK: one player URL, stable Electron save origin, release-authored default assets, packaged static-server parity, canonical runtime backends, no prod query fork.');

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
