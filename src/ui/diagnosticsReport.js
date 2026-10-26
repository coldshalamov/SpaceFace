// Diagnostics report: the plain text a beta tester pastes into an issue when something breaks.
//
// Built from what is already in memory — game version + build, browser, GPU, the graphics
// settings that decide what runs, where the game was, and the last few runtime errors from
// src/core/errorBoundary.js. It deliberately carries NO personal data: no save contents
// (credits, names, inventory, seed), no credentials, and no file paths (error text is
// path-collapsed by the boundary; failure text is collapsed again here).
//
// buildDiagnosticsReport() is pure and never throws — it is called from a recovery pane, i.e.
// on a machine that is already misbehaving, possibly before the game state exists at all.

import { CREDITS } from '../data/credits.js';
import { CURRENT_VERSION as SAVE_VERSION } from '../data/saveVersion.js';
import { detectGpu } from '../render/adaptiveQuality.js';
import { recentRuntimeErrors, sanitizeErrorText } from '../core/errorBoundary.js';
import { startupJournalSnapshot } from '../core/startupJournal.js';
import { leftoverVersionLabel, loadLeftoverVersionPayload } from './screens/mainMenu.js';

// Video settings that decide how hard the renderer works (state.settings.video).
const VIDEO_KEYS = [
  'qualityPreset', 'renderScale', 'dynamicResolution', 'pixelRatioCap', 'frameCap', 'vsync',
  'bloom', 'postFx', 'shadows', 'particleQuality', 'renderGraph', 'motionReduce',
];
// Live renderer flags (state.render) worth knowing; only primitives are printed.
const RENDER_KEYS = [
  'dynResScale', 'renderGraphUnavailable', 'pipelinePrecompileReady',
  'deferNoncriticalMeshStreaming', 'openingVfxFrozen',
];

let versionPayload = null;
let versionPromise = null;
let gpuProbe;   // undefined = not probed yet; null = probed, no WebGL

/** Forget the primed build hash and the WebGL probe (tests only). */
export function resetDiagnosticsReportCache() {
  versionPayload = null;
  versionPromise = null;
  gpuProbe = undefined;
}

/**
 * Start resolving the build hash (an async read of the release receipt) so the synchronous
 * report builder and the click handler never wait on it. Safe to call repeatedly.
 */
export function primeDiagnosticsReport() {
  if (!versionPromise) {
    try {
      versionPromise = Promise.resolve(loadLeftoverVersionPayload())
        .then((payload) => { versionPayload = payload || null; return versionPayload; })
        .catch(() => null);
    } catch (_) { versionPromise = Promise.resolve(null); }
  }
  return versionPromise;
}

function safe(fn, fallback) {
  try { const v = fn(); return v === undefined ? fallback : v; } catch (_) { return fallback; }
}

function plain(value, max = 80) {
  if (value == null) return 'n/a';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : 'n/a';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return sanitizeErrorText(value, max);
}

function gpuFor(state, doc) {
  const known = state && state.render && state.render.gpu;
  if (known && typeof known === 'object') return known;
  if (gpuProbe !== undefined) return gpuProbe;
  // No renderer yet (boot failure, or a graphics failure before it published). Ask a throwaway
  // canvas once; "no WebGL at all" is itself the most useful line in that report.
  try {
    if (!doc || typeof doc.createElement !== 'function') return null;
    const canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) { gpuProbe = null; return null; }
    gpuProbe = detectGpu({ getContext: () => gl });
    const lose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
    if (lose && lose.loseContext) lose.loseContext();
  } catch (_) { /* leave gpuProbe unset: "not detected" rather than a false "no WebGL" */ }
  return gpuProbe === undefined ? null : gpuProbe;
}

function environmentLines(env) {
  const lines = [];
  lines.push('Browser: ' + plain(env.userAgent || 'unknown', 240));   // the version is at the END of a UA
  const cores = env.hardwareConcurrency;
  const mem = env.deviceMemory;
  const bits = [];
  if (Number.isFinite(cores)) bits.push(cores + ' cores');
  if (Number.isFinite(mem)) bits.push('~' + mem + ' GB memory');
  if (env.viewport) bits.push(env.viewport.width + 'x' + env.viewport.height + ' @' + env.viewport.dpr + 'x');
  if (bits.length) lines.push('Machine: ' + bits.join(', '));
  return lines;
}

function readEnvironment(g) {
  const nav = g.navigator || null;
  const win = g.window || g;
  const viewport = Number.isFinite(win.innerWidth) && Number.isFinite(win.innerHeight)
    ? { width: Math.round(win.innerWidth), height: Math.round(win.innerHeight), dpr: Math.round((win.devicePixelRatio || 1) * 100) / 100 }
    : null;
  return {
    userAgent: nav && nav.userAgent,
    hardwareConcurrency: nav && nav.hardwareConcurrency,
    deviceMemory: nav && nav.deviceMemory,
    viewport,
  };
}

/**
 * buildDiagnosticsReport(state, opts) -> string
 *  opts.failure  { code, headline, fills, detail, message, site, tick, simTime } from a recovery pane
 *  opts.version  a { version, build } payload (default: the primed release receipt, else bundled)
 *  opts.env      { userAgent, hardwareConcurrency, deviceMemory, viewport } (default: this browser)
 *  opts.errors   the recent-error list (default: the shared ring)
 *  opts.now      a Date (default: now)
 *  opts.document used only to probe WebGL when the game has not published its GPU
 */
export function buildDiagnosticsReport(state, opts = {}) {
  const out = [];
  const g = globalThis;
  const st = state && typeof state === 'object' ? state : null;

  out.push('SpaceFace diagnostics');
  out.push('Game: ' + safe(() => leftoverVersionLabel(opts.version || versionPayload || { version: CREDITS.version, build: '' }), 'SpaceFace (version unknown)'));
  out.push('Captured: ' + safe(() => (opts.now instanceof Date ? opts.now : new Date()).toISOString(), 'unknown time'));
  out.push('Save format: v' + SAVE_VERSION);

  for (const line of safe(() => environmentLines(opts.env || readEnvironment(g)), ['Browser: unknown'])) out.push(line);

  const gpu = safe(() => gpuFor(st, opts.document !== undefined ? opts.document : g.document), null);
  if (gpu) {
    out.push('Graphics: ' + plain(gpu.renderer) + ' (' + plain(gpu.vendor) + ')');
    out.push('Graphics tier: ' + plain(gpu.tier) + (gpu.software ? ' (software rendering)' : ''));
  } else {
    out.push('Graphics: ' + (gpuProbe === null ? 'WebGL is not available' : 'not detected yet'));
  }

  if (st) {
    // Each line is read on its own: a hostile or half-built state costs that line, not the report.
    const line = (fn) => { const v = safe(fn, null); if (v) out.push(v); };
    line(() => 'Mode: ' + plain(st.mode) + (st.run && st.run.kind && st.run.phase !== 'inactive' ? ' (' + plain(st.run.kind) + ')' : ''));
    line(() => 'Sector: ' + plain(safe(() => st.world.currentSectorId, null)));
    line(() => 'Sim: tick ' + plain(st.tick) + ', ' + plain(st.simTime) + ' s');
    line(() => {
      const video = st.settings.video;
      return video ? 'Quality: ' + VIDEO_KEYS.filter((k) => video[k] !== undefined).map((k) => k + '=' + plain(video[k])).join(', ') : null;
    });
    line(() => {
      const render = st.render;
      if (!render || typeof render !== 'object') return null;
      const flags = RENDER_KEYS
        .filter((k) => render[k] !== undefined && render[k] !== null && typeof render[k] !== 'object' && typeof render[k] !== 'function')
        .map((k) => k + '=' + plain(render[k]));
      flags.push('renderGraph=' + plain(!!render.renderGraph));
      return 'Renderer flags: ' + flags.join(', ');
    });
    line(() => {
      const backend = safe(() => st.settings.gameplay.physicsBackend, null);
      const ready = safe(() => st.physicsRuntime.diagnostics.sg02Ready, null);
      return backend ? 'Physics: ' + plain(backend) + (ready === null ? '' : ', authority ' + (ready ? 'ready' : 'NOT ready')) : null;
    });
  } else {
    out.push('Game state: not created yet (the failure happened during startup)');
  }

  const failure = opts.failure && typeof opts.failure === 'object' ? opts.failure : null;
  if (failure) {
    out.push('');
    out.push('Failure');
    const field = (label, value) => { if (value != null && value !== '') out.push('  ' + label + ': ' + sanitizeErrorText(value, 300)); };
    field('Code', failure.code);
    field('What', failure.headline);
    field('Detail', failure.fills);
    field('Next step', failure.detail);
    field('Message', failure.message);
    field('Site', failure.site);
    field('Tick', failure.tick);
    field('Sim time', failure.simTime);
  }

  const startup = safe(() => opts.startup || startupJournalSnapshot(), null);
  if (startup) {
    out.push('', 'Startup history');
    for (const [name, attempt] of [['Previous document', startup.previous], ['Current document', startup.current]]) {
      if (!attempt) continue;
      out.push('  ' + name + ': ' + plain(attempt.status) + ', last phase ' + plain(attempt.phase));
      out.push('    Started: ' + plain(attempt.startedAt) + ', time origin ' + plain(attempt.timeOrigin));
      if (attempt.sample) out.push('    State: ' + sanitizeErrorText(JSON.stringify(attempt.sample), 1000));
      for (const event of (attempt.events || []).slice(-24)) {
        out.push('    ' + sanitizeErrorText(JSON.stringify(event), 600));
      }
    }
  }
  const errors = safe(() => (Array.isArray(opts.errors) ? opts.errors : recentRuntimeErrors()), []);
  out.push('');
  out.push('Recent errors (' + errors.length + ')');
  if (!errors.length) out.push('  none recorded');
  for (const e of errors) {
    if (!e || typeof e !== 'object') continue;
    // Entries from the ring are already path-collapsed; entries handed in are collapsed here too.
    const where = [e.mode, e.simTime != null ? 'sim ' + e.simTime + ' s' : null].filter(Boolean).join(', ');
    out.push('  [+' + Math.round((e.at || 0) / 1000) + 's' + (where ? ', ' + where : '') + '] '
      + sanitizeErrorText(e.label || 'error', 60) + ': ' + sanitizeErrorText(e.message || ''));
    if (e.stack) out.push('      ' + sanitizeErrorText(e.stack, 600));
  }
  return out.join('\n');
}

/**
 * copyTextToClipboard(text, env) -> Promise<boolean>
 * navigator.clipboard.writeText is invoked synchronously (it must run inside the click that asked
 * for it); a hidden-textarea execCommand('copy') is the fallback for insecure contexts and
 * permission refusals. Resolves false, never rejects.
 */
export function copyTextToClipboard(text, env = {}) {
  const nav = env.navigator !== undefined ? env.navigator : globalThis.navigator;
  const doc = env.document !== undefined ? env.document : globalThis.document;
  const value = String(text == null ? '' : text);
  const fallback = () => {
    let area = null;
    const prior = doc && doc.activeElement;
    try {
      if (!doc || typeof doc.createElement !== 'function' || typeof doc.execCommand !== 'function') return false;
      area = doc.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.setAttribute('aria-hidden', 'true');
      area.style.position = 'fixed';
      area.style.top = '0';
      area.style.left = '0';
      area.style.opacity = '0';
      (doc.body || doc.documentElement).appendChild(area);
      if (typeof area.focus === 'function') area.focus();
      if (typeof area.select === 'function') area.select();
      if (typeof area.setSelectionRange === 'function') area.setSelectionRange(0, value.length);
      return doc.execCommand('copy') === true;
    } catch (_) {
      return false;
    } finally {
      try { if (area && area.parentNode) area.parentNode.removeChild(area); } catch (_) { /* ignore */ }
      try { if (prior && typeof prior.focus === 'function') prior.focus(); } catch (_) { /* ignore */ }
    }
  };
  try {
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      return Promise.resolve(nav.clipboard.writeText(value)).then(() => true, () => fallback());
    }
  } catch (_) { /* fall through to the textarea route */ }
  return Promise.resolve(fallback());
}

/** Build the report for `state` and copy it. Resolves true when the clipboard took it. */
export function copyDiagnosticsReport(state, opts = {}) {
  let text;
  try { text = buildDiagnosticsReport(state, opts); } catch (_) { return Promise.resolve(false); }
  return copyTextToClipboard(text, opts);
}
