'use strict';
// Player presence: "the owner is playing right now".
//
// This laptop is a 15 W machine shared between the person playing and a fleet of agents whose
// probes boot second copies of the game on the same integrated GPU. A second copy running while
// the owner plays slows his game and makes every measurement worthless. The desktop shell writes a
// small heartbeat while its window is focused; the game lock reads it and holds test launches
// until the player stops (bounded, so a forgotten window never blocks the fleet for long).
//
// The same tick gives the focused game scheduling priority over background work and hands it
// back when the window loses focus. With the priority goes the power-throttling opt-out
// (scripts/lib/processScheduling.cjs): Windows normally grants a focused window its high
// quality-of-service class by itself, but the two only pay off together (measured there), so the
// game states it for its own processes instead of depending on how the shell classifies the window.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PRESENCE_FRESH_MS = 15_000;
const PRESENCE_TICK_MS = 4_000;

function presencePath(tmpDir = os.tmpdir()) {
  return path.join(tmpDir, 'spaceface-launcher', 'player-presence.json');
}

function readPresence(file = presencePath()) {
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    return record && typeof record === 'object' ? record : null;
  } catch (_) {
    return null;
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return !!(error && error.code === 'EPERM'); }
}

/** True when a focused player window reported in within the freshness window and still exists. */
function isPlayerPlaying(record, nowMs = Date.now(), isAlive = pidAlive) {
  if (!record || record.focused !== true) return false;
  if (!Number.isFinite(record.at) || nowMs - record.at > PRESENCE_FRESH_MS || nowMs < record.at - 60_000) return false;
  return isAlive(record.pid);
}

function writePresence(record, file = presencePath()) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record));
    fs.renameSync(tmp, file);
    return true;
  } catch (_) {
    return false;
  }
}

function clearPresence(file = presencePath()) {
  try { fs.unlinkSync(file); } catch (_) { /* already gone */ }
}

function setPriority(pid, priority) {
  try { os.setPriority(pid, priority); return true; } catch (_) { return false; }
}

function defaultThrottlingOptOut() {
  try { return require('./processScheduling.cjs').setPowerThrottlingOptOut; } catch (_) { return null; }
}

/**
 * Desktop shell side. `isFocused()` says whether a visible, focused game window exists;
 * `processIds()` lists the shell's own processes (browser, GPU, renderer, utility).
 * Returns a stop function.
 */
function startPlayerPresence({ isFocused, processIds, file = presencePath(), tickMs = PRESENCE_TICK_MS,
  onScheduling = null, setThrottlingOptOut = defaultThrottlingOptOut() } = {}) {
  if (typeof isFocused !== 'function') return () => {};
  const ABOVE = os.constants.priority.PRIORITY_ABOVE_NORMAL;
  const NORMAL = os.constants.priority.PRIORITY_NORMAL;
  let raised = false;
  let lastFocused = null;
  // The throttling opt-out is one outside call per change: when focus changes, and when the set
  // of game processes changes while focused (a renderer or GPU process that restarted).
  let throttlingFor = '';
  function applyThrottling(pids, focused) {
    const key = `${focused ? 'focused' : 'unfocused'}:${pids.slice().sort((a, b) => a - b).join(',')}`;
    if (key === throttlingFor || typeof setThrottlingOptOut !== 'function') return;
    throttlingFor = key;
    let pending = null;
    try { pending = setThrottlingOptOut(pids, focused); } catch (_) { pending = null; }
    Promise.resolve(pending).then((result) => {
      if (typeof onScheduling !== 'function') return;
      const r = result || { ok: false, applied: 0, of: pids.length, detail: 'unavailable' };
      onScheduling(focused
        ? `game window focused: above-normal priority and no power throttling for ${r.applied} of ${pids.length} game processes (${r.ok ? 'applied' : `not applied: ${r.detail}`})`
        : `game window not focused: normal priority, power throttling back to Windows for ${r.applied} of ${pids.length} game processes`,
      { focused, processes: pids.length, throttlingApplied: r.applied, ok: r.ok === true, detail: String(r.detail || '').slice(0, 200) });
    }).catch(() => {});
  }
  function tick() {
    let focused = false;
    try { focused = isFocused() === true; } catch (_) { focused = false; }
    if (focused || lastFocused !== focused) {
      writePresence({ pid: process.pid, at: Date.now(), focused }, file);
    }
    lastFocused = focused;
    // Chromium re-applies its own priority when a window changes visibility, so a focused game
    // re-asserts every tick; an unfocused one is handed back once.
    if (focused || raised) {
      let pids = [];
      try { pids = (typeof processIds === 'function' ? processIds() : []) || []; } catch (_) { pids = []; }
      for (const pid of pids) {
        if (Number.isInteger(pid) && pid > 0) setPriority(pid, focused ? ABOVE : NORMAL);
      }
      applyThrottling(pids.filter((pid) => Number.isInteger(pid) && pid > 0), focused);
      raised = focused;
    }
  }
  tick();
  const timer = setInterval(tick, tickMs);
  if (typeof timer.unref === 'function') timer.unref();
  return function stop() {
    clearInterval(timer);
    clearPresence(file);
  };
}

module.exports = {
  PRESENCE_FRESH_MS,
  PRESENCE_TICK_MS,
  clearPresence,
  isPlayerPlaying,
  presencePath,
  readPresence,
  startPlayerPresence,
  writePresence,
};
