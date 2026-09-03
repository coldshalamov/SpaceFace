// SETTINGS-RUNTIME-TRUTH — renderer video reconcile contracts.
//
// Lanes: actual draw-buffer / pixel-ratio, shadows, key-light binding, and
// single-subscribe listener/resource discipline. Pure formula + static source
// contracts (no WebGL). Does NOT edit renderer.js — red assertions document the
// diagnosed seam when boot shadows=false cannot late-enable a real key-light
// shadow caster via settings:changed.
//
// Run: node --test test/renderer-settings-runtime-truth.test.mjs
//
// Required renderer seam (when red): a single video-runtime reconcile path
// (e.g. `_reconcileVideoRuntime({ key })` / `_ensureKeyLightShadows()`) that
// settings:changed and boot both call, so:
//   • draw buffer = f(pixelRatioCap, renderScale, dynResScale) after every
//     renderScale / pixelRatioCap / section-wide change
//   • shadows ON always binds `_keyLight`, configures shadow map/frustum once,
//     and leaves cast/enabled gating to `_syncShadowMapEnabled`
//   • shadows OFF only disables cast/enabled (does not permanently null the
//     key light if re-enable must work)
//   • bus + window listeners are bound once (idempotent init / off-before-on)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RENDERER_PATH = join(ROOT, 'src', 'render', 'renderer.js');
const GAME_STATE_PATH = join(ROOT, 'src', 'core', 'gameState.js');

const rendererSource = readFileSync(RENDERER_PATH, 'utf8');
const gameStateSource = readFileSync(GAME_STATE_PATH, 'utf8');

// ── Expected draw-buffer / pixel-ratio formula (mirrors applyRendererSize) ──

function finiteInRange(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Same product as renderer.js applyRendererSize → setPixelRatio. */
function expectedPixelRatio(video, {
  devicePixelRatio = 1,
  dynResScale = 1,
  renderGraphUnavailable = false,
} = {}) {
  const vd = video || {};
  const cap = finiteInRange(vd.pixelRatioCap, 0.25, 4, 2);
  const graphOwnsScale = vd.renderGraph === true && renderGraphUnavailable !== true;
  const scale = graphOwnsScale ? 1 : finiteInRange(vd.renderScale, 0.5, 2, 1);
  const dyn = finiteInRange(dynResScale, 0.2, 1, 1);
  const base = Math.min(devicePixelRatio || 1, cap);
  return Math.max(0.2, base * scale * dyn);
}

function expectedDrawBuffer(video, {
  cssWidth = 1920,
  cssHeight = 1080,
  devicePixelRatio = 1,
  dynResScale = 1,
  renderGraphUnavailable = false,
} = {}) {
  const pr = expectedPixelRatio(video, { devicePixelRatio, dynResScale, renderGraphUnavailable });
  return {
    pixelRatio: pr,
    width: Math.floor(cssWidth * pr),
    height: Math.floor(cssHeight * pr),
  };
}

// A deliberately DOWN-SCALED video profile, not the shipped default. It exists so the draw-buffer
// formula tests below exercise a non-unit renderScale and a shadows-off starting point, and so
// MAX_VIDEO stays genuinely distinct from it. The shipped defaults are asserted separately against
// gameState.js source (they are renderScale 1.0 / shadows true since the measured A/B showed full
// resolution and shadows are free on the 60fps target hardware).
const SCALED_VIDEO = Object.freeze({
  renderScale: 0.85,
  pixelRatioCap: 2,
  shadows: false,
  bloom: true,
  particleQuality: 'medium',
  dynamicResolution: false,
  fov: 50,
});

const MAX_VIDEO = Object.freeze({
  ...SCALED_VIDEO,
  renderScale: 1,
  pixelRatioCap: 4,
  shadows: true,
  bloom: true,
  particleQuality: 'high',
  dynamicResolution: false,
});

// ── Static extract helpers ──────────────────────────────────────────────────

function extractFunctionBody(source, name) {
  const patterns = [
    new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`),
    new RegExp(`${name}\\s*\\([^)]*\\)\\s*\\{`),
  ];
  let start = -1;
  for (const pattern of patterns) {
    start = source.search(pattern);
    if (start >= 0) break;
  }
  assert.ok(start >= 0, `${name}() should exist in renderer source`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(brace, i + 1);
    }
  }
  assert.fail(`${name}() body should close`);
}

function extractSettingsChangedHandler(source) {
  const marker = /(?:bus\.on|onBus)\(\s*['"]settings:changed['"]\s*,\s*\(?\s*p\s*\)?\s*=>\s*\{/;
  const m = marker.exec(source);
  assert.ok(m, 'one settings:changed subscription handler must exist');
  const brace = source.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(brace, i + 1);
    }
  }
  assert.fail('settings:changed handler body should close');
}

function countOccurrences(source, pattern) {
  const re = typeof pattern === 'string' ? new RegExp(pattern, 'g') : new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  return (source.match(re) || []).length;
}

// ── Simulated runtime (documents live behaviour vs required seam) ───────────

/**
 * Models the LIVE renderer video shadow/key-light path as of the working tree:
 * boot gates `_keyLight` + shadow frustum config on initial shadowsOn; the
 * settings:changed path only flips `_shadowSettingOn` / dirty flag.
 */
function createLiveShadowRuntime({ shadowsAtBoot = false } = {}) {
  const key = {
    castShadow: false,
    shadowConfigured: false,
    shadow: { mapSize: { x: 0, y: 0 } },
  };
  const renderer = { shadowMap: { enabled: false, type: 'PCF' } };

  // Source-selected model: stays red against the historical boot gate and turns green only when
  // renderer.js retains/configures a reusable key-light seam.
  const hasReconcileSeam = /_ensureKeyLightShadows\s*\(/.test(rendererSource);
  const bootGate = /this\._keyLight\s*=\s*shadowsOn\s*\?\s*key\s*:\s*null/.test(rendererSource);
  const shadowsOn = shadowsAtBoot !== false && shadowsAtBoot !== undefined
    ? !!shadowsAtBoot
    : false;
  // Live code: `!(...shadows === false)` — default false → shadowsOn false.
  const bootShadowsOn = shadowsAtBoot === true;
  const bootKeepsKey = !bootGate || bootShadowsOn;
  const bootConfiguresShadows = bootShadowsOn || (bootKeepsKey && hasReconcileSeam);
  if (bootConfiguresShadows) {
    renderer.shadowMap.enabled = false;
    key.castShadow = true;
    key.shadowConfigured = true;
    key.shadow.mapSize = { x: 1024, y: 1024 };
  }
  let _keyLight = bootKeepsKey ? key : null;
  let _shadowSettingOn = bootShadowsOn;
  let _shadowReceiversDirty = true;
  let _shadowReceiverCount = 0;

  function applySettingsChanged({ key: settingKey = null, video }) {
    if (settingKey === 'shadows' || settingKey == null) {
      _shadowSettingOn = video.shadows !== false;
      _shadowReceiversDirty = true;
      if (hasReconcileSeam) {
        _keyLight = key;
        key.shadowConfigured = true;
        key.shadow.mapSize = { x: 1024, y: 1024 };
      }
    }
  }

  function syncShadowMapEnabled() {
    // Mirrors _syncShadowMapEnabled — no-ops when _keyLight is null.
    if (!_keyLight || !renderer.shadowMap) return;
    if (!_shadowSettingOn) {
      renderer.shadowMap.enabled = false;
      _keyLight.castShadow = false;
      return;
    }
    if (_shadowReceiversDirty) {
      _shadowReceiverCount = 1; // pretend a receiver exists after dirty scan
      _shadowReceiversDirty = false;
    }
    const enabled = _shadowReceiverCount > 0;
    renderer.shadowMap.enabled = enabled;
    _keyLight.castShadow = enabled;
  }

  function snapshot() {
    return {
      keyLightBound: _keyLight === key,
      keyLightNull: _keyLight == null,
      shadowSettingOn: _shadowSettingOn,
      castShadow: key.castShadow,
      shadowMapEnabled: renderer.shadowMap.enabled,
      shadowConfigured: key.shadowConfigured,
    };
  }

  return {
    key,
    applySettingsChanged,
    syncShadowMapEnabled,
    snapshot,
    // Ideal seam the product needs (not wired live — used only for contrast).
    reconcileVideoShadowsIdeal(video) {
      const want = video.shadows !== false;
      _shadowSettingOn = want;
      _shadowReceiversDirty = true;
      if (want) {
        if (!key.shadowConfigured) {
          key.shadowConfigured = true;
          key.shadow.mapSize = { x: 1024, y: 1024 };
        }
        _keyLight = key;
      } else {
        // Keep key bound so re-enable works; disable cast/map each frame.
        _keyLight = key;
        key.castShadow = false;
        renderer.shadowMap.enabled = false;
      }
    },
  };
}

// ── 1. Defaults + pure draw-buffer formula ──────────────────────────────────

test('default video defaults include pixelRatioCap, renderScale, shadows', () => {
  assert.match(gameStateSource, /pixelRatioCap:\s*2/, 'default pixelRatioCap is 2');
  // Raised from 0.85/false after a matched A/B on the 60fps target hardware (Intel iGPU, 1920x1080,
  // 20s warmup so authored admission had settled): p95 16.80ms both, max 17.20ms vs 17.00ms. The
  // frame is vsync-locked with headroom, so sub-native resolution bought nothing.
  assert.match(gameStateSource, /renderScale:\s*1\.0/, 'default renderScale is 1.0 (native)');
  assert.match(gameStateSource, /shadows:\s*true/, 'default shadows is on');
});

test('applyRendererSize formula: boot defaults vs max vs restore (devicePR=2)', () => {
  const dpr = 2;
  const boot = expectedDrawBuffer(SCALED_VIDEO, { devicePixelRatio: dpr });
  // min(2, cap=2) * 0.85 * 1 = 1.7
  assert.equal(boot.pixelRatio, 1.7);
  assert.equal(boot.width, Math.floor(1920 * 1.7));
  assert.equal(boot.height, Math.floor(1080 * 1.7));

  const maxed = expectedDrawBuffer(MAX_VIDEO, { devicePixelRatio: dpr });
  // min(2, cap=4) * 1 * 1 = 2
  assert.equal(maxed.pixelRatio, 2);
  assert.equal(maxed.width, 3840);
  assert.equal(maxed.height, 2160);

  const restored = expectedDrawBuffer(SCALED_VIDEO, { devicePixelRatio: dpr });
  assert.deepEqual(restored, boot, 'current→max→current must restore boot draw buffer');
});

test('applyRendererSize formula: dynResScale multiplies without mutating settings.video', () => {
  const video = { ...SCALED_VIDEO };
  const full = expectedPixelRatio(video, { devicePixelRatio: 2, dynResScale: 1 });
  const half = expectedPixelRatio(video, { devicePixelRatio: 2, dynResScale: 0.5 });
  assert.equal(full, 1.7);
  assert.equal(half, 0.85);
  assert.equal(video.renderScale, 0.85, 'dyn res must not rewrite persisted renderScale');
  assert.equal(video.pixelRatioCap, 2, 'dyn res must not rewrite pixelRatioCap');
});

test('render graph keeps a native presentation buffer and applies configured scale internally once', () => {
  const video = { ...SCALED_VIDEO, renderGraph: true };
  const output = expectedDrawBuffer(video, { devicePixelRatio: 2 });
  assert.equal(output.pixelRatio, 2, 'graph output remains at capped native presentation resolution');
  assert.equal(output.width, 3840);
  assert.equal(Math.floor(output.width * video.renderScale), 3264,
    'the graph scene target applies the configured 0.85 exactly once');
  const degraded = expectedDrawBuffer(video, {
    devicePixelRatio: 2,
    renderGraphUnavailable: true,
  });
  assert.equal(degraded.pixelRatio, 1.7,
    'the bloom-wrapper fallback resumes drawing-buffer scale instead of applying it zero times');
});

// ── 2. Static: draw-buffer / pixel-ratio reconcile path exists ──────────────

test('static: applyRendererSize uses one route-owned scale and is used at boot + resize', () => {
  const body = extractFunctionBody(rendererSource, 'applyRendererSize');
  assert.match(body, /pixelRatioCap/, 'applyRendererSize reads pixelRatioCap');
  assert.match(body, /renderScale/, 'applyRendererSize reads renderScale');
  assert.match(body, /graphOwnsScale[\s\S]*?\?\s*1\s*:/,
    'the graph route must not also apply renderScale at the drawing buffer');
  assert.match(body, /dynResScale/, 'applyRendererSize reads dynResScale');
  assert.match(body, /setPixelRatio/, 'applyRendererSize writes setPixelRatio');
  assert.match(body, /setSize/, 'applyRendererSize writes setSize');
  assert.match(body, /getDrawingBufferSize/, 'applyRendererSize returns drawing buffer size');

  assert.match(
    rendererSource,
    /const drawSize = applyRendererSize\(\s*renderer\s*,\s*state\s*\)/,
    'boot init must size the renderer from live settings.video',
  );
  assert.match(
    rendererSource,
    /_applySize\s*\(\s*\)\s*\{[\s\S]*applyRendererSize\(\s*this\.renderer\s*,\s*this\.state\s*\)/,
    '_applySize must re-run applyRendererSize from current state',
  );
  assert.match(
    rendererSource,
    /onResize\s*\(\s*\)\s*\{[\s\S]*this\._applySize\s*\(\s*\)/,
    'onResize must call _applySize',
  );
});

test('static: settings:changed re-applies size for renderScale / pixelRatioCap / section-wide', () => {
  const handler = extractSettingsChangedHandler(rendererSource);
  assert.match(handler, /section\s*!==\s*['"]video['"]/, 'handler scopes to video section');
  assert.match(
    handler,
    /p\.key\s*===\s*['"]renderScale['"][\s\S]*?p\.key\s*===\s*['"]pixelRatioCap['"][\s\S]*?p\.key\s*===\s*['"]renderGraph['"][\s\S]*?p\.key\s*==\s*null/,
    'renderScale, pixelRatioCap, renderGraph (and key=null) must trigger resize',
  );
  assert.match(handler, /this\.onResize\s*\(\s*\)/, 'size path must call onResize');
});

// ── 3. Static: shadows / key-light — exposes required seam when red ─────────

test('static: settings:changed shadows path must rebind key light + ensure shadow config', () => {
  const handler = extractSettingsChangedHandler(rendererSource);

  assert.match(
    handler,
    /_shadowSettingOn\s*=\s*vd\.shadows\s*!==\s*false/,
    'shadows setting must update _shadowSettingOn',
  );
  const directDirtyWrite = /_shadowReceiversDirty\s*=\s*true/.test(handler);
  const dirtyHelperCall = /this\._markShadowReceiversDirty\s*\(\s*\)/.test(handler);
  const dirtyHelper = dirtyHelperCall
    ? extractFunctionBody(rendererSource, '_markShadowReceiversDirty')
    : '';
  const helperWritesBothDirtyFlags = dirtyHelperCall
    && /this\._shadowReceiversDirty\s*=\s*true/.test(dirtyHelper)
    && /this\._shadowMapDirty\s*=\s*true/.test(dirtyHelper);
  assert.ok(
    directDirtyWrite || helperWritesBothDirtyFlags,
    'shadows setting must dirty receiver scanning and shadow-map work',
  );

  // Required seam: live-apply must not leave _keyLight permanently boot-gated.
  const rebindsKeyLight =
    /_keyLight\s*=/.test(handler)
    || /_ensureKeyLightShadows\s*\(/.test(handler)
    || /_reconcileVideoRuntime\s*\(/.test(handler)
    || /_reconcileVideoShadows\s*\(/.test(handler)
    || /_syncKeyLightShadows\s*\(/.test(handler);

  assert.ok(
    rebindsKeyLight,
    [
      'REQUIRED RENDERER SEAM: settings:changed (shadows | key==null) must rebind',
      'or ensure the directional key light for shadows — not only flip _shadowSettingOn.',
      'Boot currently does: this._keyLight = shadowsOn ? key : null',
      'with shadow map/frustum only inside `if (shadowsOn) { ... }`.',
      'Late-enable after default shadows:false therefore never gets a caster.',
      'Add something like `_ensureKeyLightShadows()` / `_reconcileVideoRuntime({key})`',
      'called from init (after lights) and from the settings:changed video handler.',
    ].join(' '),
  );
});

test('static: boot must not permanently orphan key-light when shadows start false', () => {
  const bootGate = /this\._keyLight\s*=\s*shadowsOn\s*\?\s*key\s*:\s*null/;
  const hasReconcileSeam =
    /_ensureKeyLightShadows\s*\(/.test(rendererSource)
    || /_reconcileVideoRuntime\s*\(/.test(rendererSource)
    || /_reconcileVideoShadows\s*\(/.test(rendererSource)
    || /_syncKeyLightShadows\s*\(/.test(rendererSource);

  assert.ok(!bootGate.test(rendererSource) || hasReconcileSeam,
    'boot-off must retain the key light or provide a settings reconcile seam');
});

// ── 4. Runtime model: current → max → current ───────────────────────────────

test('runtime model (live): pixel-ratio path current→max→current is stable', () => {
  // Size path is pure + wired; this is the green half of current→max→current.
  const dpr = 1.5;
  const current = expectedDrawBuffer(SCALED_VIDEO, { devicePixelRatio: dpr, cssWidth: 1280, cssHeight: 720 });
  const maxed = expectedDrawBuffer(MAX_VIDEO, { devicePixelRatio: dpr, cssWidth: 1280, cssHeight: 720 });
  const back = expectedDrawBuffer(SCALED_VIDEO, { devicePixelRatio: dpr, cssWidth: 1280, cssHeight: 720 });

  assert.ok(maxed.pixelRatio >= current.pixelRatio, 'max quality must not shrink pixel ratio');
  assert.deepEqual(back, current, 'restoring video settings restores draw buffer');
  // Live applyRendererSize is re-entered via onResize on those keys (static test above).
});

test('runtime model (source-selected): shadows false@boot → true → false reconciles', () => {
  const rt = createLiveShadowRuntime({ shadowsAtBoot: false });
  let snap = rt.snapshot();
  assert.equal(snap.keyLightBound, true, 'default boot retains the key-light reference');
  assert.equal(snap.shadowConfigured, true, 'default boot prepares reusable shadow resources');

  // current → max (shadows on)
  rt.applySettingsChanged({ key: 'shadows', video: { ...SCALED_VIDEO, shadows: true } });
  rt.syncShadowMapEnabled();
  snap = rt.snapshot();

  assert.equal(snap.shadowSettingOn, true, 'flag flips on settings:changed');
  assert.equal(
    snap.keyLightBound,
    true,
    'after shadows:true, key light must be bound',
  );
  assert.equal(
    snap.shadowConfigured,
    true,
    'after shadows:true, key.shadow map/frustum must be configured',
  );
  assert.equal(
    snap.castShadow || snap.shadowMapEnabled,
    true,
    'with receivers present, cast/enabled should arm after enable',
  );

  // max → current (shadows off) — ideal still keeps light bound for re-enable
  rt.applySettingsChanged({ key: 'shadows', video: { ...SCALED_VIDEO, shadows: false } });
  rt.syncShadowMapEnabled();
  snap = rt.snapshot();
  assert.equal(snap.shadowSettingOn, false);
});

test('runtime model (ideal seam): shadows false@boot → true → false works without re-init', () => {
  // Contrasts the live model: what `_ensureKeyLightShadows` would provide.
  const rt = createLiveShadowRuntime({ shadowsAtBoot: false });
  rt.reconcileVideoShadowsIdeal({ ...SCALED_VIDEO, shadows: true });
  rt.syncShadowMapEnabled();
  let snap = rt.snapshot();
  assert.equal(snap.keyLightBound, true);
  assert.equal(snap.shadowConfigured, true);
  assert.equal(snap.shadowMapEnabled, true);
  assert.equal(snap.castShadow, true);

  rt.reconcileVideoShadowsIdeal({ ...SCALED_VIDEO, shadows: false });
  rt.syncShadowMapEnabled();
  snap = rt.snapshot();
  assert.equal(snap.shadowSettingOn, false);
  assert.equal(snap.shadowMapEnabled, false);
  assert.equal(snap.castShadow, false);
  assert.equal(snap.keyLightBound, true, 'ideal keeps key bound for re-enable');

  rt.reconcileVideoShadowsIdeal({ ...SCALED_VIDEO, shadows: true });
  rt.syncShadowMapEnabled();
  snap = rt.snapshot();
  assert.equal(snap.shadowMapEnabled, true);
  assert.equal(snap.castShadow, true);
});

test('runtime model (live): shadows true@boot can toggle off/on without rebind', () => {
  // Shows the asymmetric path: only boot-with-shadows-true works today.
  const rt = createLiveShadowRuntime({ shadowsAtBoot: true });
  assert.equal(rt.snapshot().keyLightBound, true);
  assert.equal(rt.snapshot().shadowConfigured, true);

  rt.applySettingsChanged({ key: 'shadows', video: { shadows: false } });
  rt.syncShadowMapEnabled();
  assert.equal(rt.snapshot().shadowMapEnabled, false);
  assert.equal(rt.snapshot().castShadow, false);
  assert.equal(rt.snapshot().keyLightBound, true);

  rt.applySettingsChanged({ key: 'shadows', video: { shadows: true } });
  rt.syncShadowMapEnabled();
  assert.equal(rt.snapshot().shadowMapEnabled, true);
  assert.equal(rt.snapshot().castShadow, true);
});

// ── 5. No duplicate listener / resource creation ────────────────────────────

test('static: settings:changed and resize listeners must be single-subscribe safe', () => {
  const settingsSubs = countOccurrences(rendererSource, /(?:bus\.on|onBus)\(\s*['"]settings:changed['"]/);
  assert.equal(
    settingsSubs,
    1,
    `exactly one settings:changed subscription site expected (found ${settingsSubs})`,
  );

  const resizeSubs = countOccurrences(rendererSource, /addEventListener\(\s*['"]resize['"]/);
  assert.equal(
    resizeSubs,
    1,
    `exactly one window resize addEventListener site expected (found ${resizeSubs})`,
  );

  // Idempotent init / off-before-on — required so a second init (context restore
  // paths that re-emit settings, HMR, or double registry init) cannot stack handlers.
  const hasIdempotentGuard =
    /_videoSettingsBound|_settingsListener|_onVideoSettingsChanged|_boundVideoSettings/.test(rendererSource)
    || /bus\.off\(\s*['"]settings:changed['"]/.test(rendererSource)
    || /removeEventListener\(\s*['"]resize['"]/.test(rendererSource)
    || /if\s*\(\s*this\._init(?:ialized|Done|_done)\s*\)/.test(rendererSource);

  assert.ok(
    hasIdempotentGuard,
    [
      'REQUIRED RENDERER SEAM (listener discipline): init registers one settings:changed subscription',
      'and window resize with no off/guard. A second init would duplicate listeners and',
      'double-apply size/shadows. Bind once (named handler + bus.off/removeEventListener)',
      'or early-return when video runtime is already wired.',
    ].join(' '),
  );
});

test('static: shadow map / key light resources must not be re-created on every settings tick', () => {
  const handler = extractSettingsChangedHandler(rendererSource);
  // settings:changed must not `new THREE.DirectionalLight` or allocate a new shadow camera each toggle.
  assert.doesNotMatch(
    handler,
    /new\s+THREE\.DirectionalLight/,
    'settings:changed must not allocate a new key DirectionalLight',
  );
  assert.doesNotMatch(
    handler,
    /new\s+THREE\.WebGLRenderer/,
    'settings:changed must not allocate a new WebGLRenderer',
  );
  // Context restore re-emits settings:changed — that path must stay apply-only.
  assert.match(
    rendererSource,
    /webglcontextrestored[\s\S]*settings:changed/,
    'context restore re-emits settings:changed to re-apply (not re-allocate) video runtime',
  );
});

// ── 6. Section-wide (key==null) must cover size + shadows together ───────────

test('static: section-wide video change (key==null) covers size and shadows flags', () => {
  const handler = extractSettingsChangedHandler(rendererSource);
  assert.match(
    handler,
    /p\.key\s*===\s*['"]shadows['"]\s*\|\|\s*p\.key\s*==\s*null/,
    'key==null must refresh shadow setting flag',
  );
  assert.match(
    handler,
    /p\.key\s*===\s*['"]renderScale['"][\s\S]*?p\.key\s*===\s*['"]pixelRatioCap['"][\s\S]*?p\.key\s*===\s*['"]renderGraph['"][\s\S]*?p\.key\s*==\s*null/,
    'key==null must refresh draw buffer',
  );
  // Product truth: key==null must also hit the key-light ensure seam (same as shadows key).
  const sectionWideEnsuresKey =
    /_ensureKeyLightShadows|_reconcileVideoRuntime|_reconcileVideoShadows|_syncKeyLightShadows/.test(handler)
    || (/_keyLight\s*=/.test(handler) && /p\.key\s*==\s*null/.test(handler));

  assert.ok(
    sectionWideEnsuresKey,
    [
      'REQUIRED RENDERER SEAM: settings:changed with key==null (used by context restore and',
      'bulk video apply) must run the same key-light/shadow ensure as key==="shadows",',
      'not only _shadowSettingOn + onResize.',
    ].join(' '),
  );
});
