// Narrow bridge for the context-isolated game renderer.
// The renderer may subscribe to allowlisted shell state and invoke the few named request channels
// exposed below (quit, save-clip, build-info, achievement-unlock, steam-status); there is no generic
// send/invoke surface.
const { contextBridge, ipcRenderer } = require('electron');

// S1 stage D: SPACEFACE_SIM_LANE opts the authoritative sim onto its worker lane for a
// launched shell. The canonical game URL forbids query params (launch policy), so the
// lane ships through localStorage 'sf.simLane' — the same channel the browser soak
// harnesses use — set here before any page module evaluates. Per-launch semantics: an
// unset env clears the key so a stale value from an env'd boot cannot pin the lane.
try {
  const simLane = String(process.env.SPACEFACE_SIM_LANE || '').trim();
  if (simLane) localStorage.setItem('sf.simLane', simLane);
  else localStorage.removeItem('sf.simLane');
} catch (_) { /* storage gated — the lane selector falls back to its default */ }

// Diagnostic-only domain mirror selection. It is accepted only for the explicit
// isolated-evidence shell used by profiling; ordinary launches always clear the
// key, including when a stale diagnostic environment variable is inherited.
try {
  const isolatedEvidence = process.env.SPACEFACE_ELECTRON_TEST_MODE === 'isolated-evidence';
  const domainProfile = isolatedEvidence
    ? String(process.env.SPACEFACE_DOMAIN_PROFILE || '').trim()
    : '';
  if (domainProfile === 'station' || domainProfile === 'commodity') {
    localStorage.setItem('sf.domainProfile', domainProfile);
  }
  else localStorage.removeItem('sf.domainProfile');
} catch (_) { /* storage gated — the lane selector falls back to station */ }

const SHELL_LIFECYCLE_CHANNEL = 'spaceface:shell-lifecycle';
const ALLOWED_STATES = new Set([
  'foreground-visible',
  'foreground-occluded',
  'hidden-or-minimized',
  'system-suspended',
]);
const ALLOWED_REASONS = new Set([
  'did-finish-load',
  'hide',
  'minimize',
  'show',
  'restore',
  'focus',
  'blur',
  'suspend',
  'resume',
  'lock-screen',
  'unlock-screen',
]);

let latestCommand = null;
const subscribers = new Set();

function normalizeCommand(command) {
  if (!command || !ALLOWED_STATES.has(command.state)) return null;
  if (!Number.isSafeInteger(command.sequence) || command.sequence <= 0) return null;
  if (!ALLOWED_REASONS.has(command.reason)) return null;
  return Object.freeze({
    state: command.state,
    sequence: command.sequence,
    reason: command.reason,
  });
}

ipcRenderer.on(SHELL_LIFECYCLE_CHANNEL, (_event, command) => {
  const normalized = normalizeCommand(command);
  if (!normalized) return;
  if (latestCommand && normalized.sequence <= latestCommand.sequence) return;
  latestCommand = normalized;
  for (const subscriber of [...subscribers]) {
    try {
      subscriber(normalized);
    } catch (error) {
      console.error('[electron-preload] lifecycle subscriber failed:', error);
    }
  }
});

const SHELL_QUIT_CHANNEL = 'spaceface:quit';

contextBridge.exposeInMainWorld('spacefaceLifecycle', Object.freeze({
  subscribe(subscriber) {
    if (typeof subscriber !== 'function') return () => {};
    subscribers.add(subscriber);
    if (latestCommand) subscriber(latestCommand);
    return () => subscribers.delete(subscriber);
  },
  quit() {
    try { ipcRenderer.send(SHELL_QUIT_CHANNEL); } catch (e) {}
  },
}));

// Also expose a minimal shell bridge for quit callers that prefer window.spacefaceShell
const SHELL_SAVE_CLIP_CHANNEL = 'spaceface:save-clip';
const SHELL_BUILD_INFO_CHANNEL = 'spaceface:build-info';
const SHELL_ACHIEVEMENT_UNLOCK_CHANNEL = 'spaceface:achievement-unlock';
const SHELL_STEAM_STATUS_CHANNEL = 'spaceface:steam-status';
const SHELL_WORKSHOP_STATUS_CHANNEL = 'spaceface:workshop-status';
const SHELL_WORKSHOP_PUBLISH_CHANNEL = 'spaceface:workshop-publish';
const SHELL_WORKSHOP_SYNC_CHANNEL = 'spaceface:workshop-sync';
const SHELL_PERF_METRICS_CHANNEL = 'spaceface:perf-metrics';
const SHELL_WINDOW_MODE_GET = 'spaceface:window-mode-get';
const SHELL_WINDOW_MODE_SET = 'spaceface:window-mode-set';
try {
  contextBridge.exposeInMainWorld('spacefaceShell', Object.freeze({
    quit() {
      try { ipcRenderer.send(SHELL_QUIT_CHANNEL); } catch (e) {}
    },
    saveClip(payload) {
      return ipcRenderer.invoke(SHELL_SAVE_CLIP_CHANNEL, payload);
    },
    // {version, build, packaged, channel} — the same build id crash reports carry.
    buildInfo() {
      return ipcRenderer.invoke(SHELL_BUILD_INFO_CHANNEL);
    },
    // PQ-033.03: mirror a local achievement unlock to Steam. Exactly { id } crosses the bridge; the
    // shell validates it against its generated id table. Resolves {ok, available, reason?, id}.
    unlockAchievement(id) {
      return ipcRenderer.invoke(SHELL_ACHIEVEMENT_UNLOCK_CHANNEL, { id: typeof id === 'string' ? id.slice(0, 64) : '' });
    },
    // {available, reason, distribution, achievements, cloud} — no paths, no app internals.
    steamStatus() {
      return ipcRenderer.invoke(SHELL_STEAM_STATUS_CHANNEL);
    },
    // PQ-172.01 Steam Workshop for the content directory. Only a manifest mod id crosses on
    // publish — the shell resolves the dir itself; no path ever leaves the sandbox.
    workshopStatus() {
      return ipcRenderer.invoke(SHELL_WORKSHOP_STATUS_CHANNEL);
    },
    workshopPublish(modId) {
      return ipcRenderer.invoke(SHELL_WORKSHOP_PUBLISH_CHANNEL, { modId: typeof modId === 'string' ? modId.slice(0, 80) : '' });
    },
    workshopSync() {
      return ipcRenderer.invoke(SHELL_WORKSHOP_SYNC_CHANNEL);
    },
    // Probe-only: per-process {pid, type, cpuPercent, workingSetKiB} from app.getAppMetrics().
    // Absent in the browser build (no spacefaceShell) — callers must feature-detect.
    perfMetrics() {
      return ipcRenderer.invoke(SHELL_PERF_METRICS_CHANNEL);
    },
    getWindowMode() {
      return ipcRenderer.invoke(SHELL_WINDOW_MODE_GET);
    },
    setWindowMode(mode) {
      const word = mode === 'maximized' || mode === 'fullscreen' || mode === 'windowed' ? mode : 'windowed';
      return ipcRenderer.invoke(SHELL_WINDOW_MODE_SET, { mode: word });
    },
  }));
} catch (e) {}
try {
  contextBridge.exposeInMainWorld('spacefaceQuit', () => {
    try { ipcRenderer.send(SHELL_QUIT_CHANNEL); } catch (e) {}
  });
} catch (e) {}
