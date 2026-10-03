// windowState.cjs — FB-106: the desktop shell remembers its window.
//
// Pure window-state round-trip and validation. No Electron imports: electron/main.cjs wires this
// into the BrowserWindow lifecycle (restore on create, write on resize/move/mode change and on
// close, under userData/window-state.json), and a Node test pins the round-trip and the
// off-screen clamp directly against stubbed paths and display tables.
//
// Honesty rules the validation enforces:
//   • a remembered rect is only restored where it is actually usable — it must keep a visible
//     slice (MIN_VISIBLE_PX on both axes) on some display's work area, else it is clamped into
//     the primary display's work area (a monitor that went away must not strand the window);
//   • sizes are clamped to the launcher's own minimums and to the largest display seen;
//   • mode is one of windowed/maximized/fullscreen; anything else reads as windowed;
//   • malformed, unreadable or unparsable state reads as "no memory", never as defaults
//     pretending to be remembered.
'use strict';

const fs = require('fs');
const path = require('path');

const WINDOW_STATE_FILE = 'window-state.json';
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 640;
const MODES = Object.freeze(['windowed', 'maximized', 'fullscreen']);
const MIN_VISIBLE_PX = 80;

function finiteInt(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeArea(area) {
  if (!area || typeof area !== 'object') return null;
  const x = finiteInt(area.x);
  const y = finiteInt(area.y);
  const width = finiteInt(area.width);
  const height = finiteInt(area.height);
  if (x == null || y == null || width == null || height == null || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function normalizeDisplays(displays) {
  if (!Array.isArray(displays)) return [];
  const rows = [];
  for (const display of displays) {
    if (!display || typeof display !== 'object') continue;
    const bounds = normalizeArea(display.bounds);
    const workArea = normalizeArea(display.workArea) || bounds;
    if (!bounds || !workArea) continue;
    rows.push({ bounds, workArea });
  }
  return rows;
}

/** The rect keeps a usable slice of itself on this work area (not a one-pixel sliver). */
function visibleOn(rect, workArea) {
  const overlapWidth = Math.min(rect.x + rect.width, workArea.x + workArea.width) - Math.max(rect.x, workArea.x);
  const overlapHeight = Math.min(rect.y + rect.height, workArea.y + workArea.height) - Math.max(rect.y, workArea.y);
  return overlapWidth >= MIN_VISIBLE_PX && overlapHeight >= MIN_VISIBLE_PX;
}

// Off-screen recovery is deliberate and simple: pin at the primary work area's origin, size kept.
function clampInto(workArea) {
  return { x: workArea.x, y: workArea.y };
}

/**
 * sanitizeWindowState(raw, displays) -> { x, y, width, height, mode } | null
 *
 * `displays` is an array of { bounds, workArea } rectangles (Electron's screen.getAllDisplays()
 * shape, plain data for tests). Returns null when there is nothing to restore: no displays, or
 * a non-object raw state — "nothing remembered" is null, never a fabricated default, so the
 * launcher's own defaults decide the first launch.
 */
function sanitizeWindowState(raw, displays) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rows = normalizeDisplays(displays);
  if (!rows.length) return null;
  const maxWidth = rows.reduce((best, row) => Math.max(best, row.bounds.width), 0);
  const maxHeight = rows.reduce((best, row) => Math.max(best, row.bounds.height), 0);
  const width = clamp(Math.max(MIN_WIDTH, finiteInt(raw && raw.width) || 0), MIN_WIDTH, Math.max(MIN_WIDTH, maxWidth));
  const height = clamp(Math.max(MIN_HEIGHT, finiteInt(raw && raw.height) || 0), MIN_HEIGHT, Math.max(MIN_HEIGHT, maxHeight));
  const mode = MODES.includes(raw && raw.mode) ? raw.mode : 'windowed';
  const x = finiteInt(raw && raw.x);
  const y = finiteInt(raw && raw.y);
  const rect = { x: x == null ? 0 : x, y: y == null ? 0 : y, width, height };
  if (x != null && y != null && rows.some((row) => visibleOn(rect, row.workArea))) {
    return { x, y, width, height, mode };
  }
  // Off-screen (or never placed): pin at the primary work area origin, size kept.
  const pinned = clampInto(rows[0].workArea);
  return { x: pinned.x, y: pinned.y, width, height, mode };
}

/** Parsed window state object, or null when the file is missing, unreadable or not an object. */
function readWindowStateFile(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

/** Best-effort atomic-enough write: temp file + rename, boolean success, never throws. */
function writeWindowStateFile(filePath, value) {
  if (typeof filePath !== 'string' || !filePath) return false;
  if (!value || typeof value !== 'object') return false;
  const body = JSON.stringify(value);
  const tempPath = `${filePath}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tempPath, body, 'utf8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch {
    try { fs.unlinkSync(tempPath); } catch { /* already gone */ }
    return false;
  }
}

module.exports = {
  MIN_HEIGHT,
  MIN_VISIBLE_PX,
  MIN_WIDTH,
  MODES,
  WINDOW_STATE_FILE,
  readWindowStateFile,
  sanitizeWindowState,
  writeWindowStateFile,
};
