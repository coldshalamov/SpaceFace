// Narrow bridge for the context-isolated game renderer.
// The renderer may subscribe to allowlisted shell state and invoke the few named request channels
// exposed below (quit, save-clip, build-info); there is no generic send/invoke surface.
const { contextBridge, ipcRenderer } = require('electron');

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
  }));
} catch (e) {}
try {
  contextBridge.exposeInMainWorld('spacefaceQuit', () => {
    try { ipcRenderer.send(SHELL_QUIT_CHANNEL); } catch (e) {}
  });
} catch (e) {}
