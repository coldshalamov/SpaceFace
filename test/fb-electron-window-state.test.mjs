// FB-106 (row 261) — the desktop shell remembers its window.
//
// The state file round-trips (userData/window-state.json, temp-dir stubbed), a remembered rect
// restores as it was, an off-screen rect is clamped into the primary display's work area, sizes
// are clamped to the launcher's own minimums and the largest display seen, and the mode
// vocabulary is honest. electron/main.cjs is source-pinned to the wiring: restore on create,
// validate against the CURRENT displays, flush on close — and isolated evidence persists nothing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  WINDOW_STATE_FILE,
  readWindowStateFile,
  sanitizeWindowState,
  writeWindowStateFile,
} = require('../electron/windowState.cjs');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAIN_SOURCE = readFileSync(join(ROOT, 'electron', 'main.cjs'), 'utf8');

// One 1920×1080 primary and one 2560×1440 secondary to its right.
const DISPLAYS = [
  { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, workArea: { x: 1920, y: 0, width: 2560, height: 1400 } },
];

function tempStateDir() {
  return mkdtempSync(join(tmpdir(), 'sf-window-state-'));
}

test('bounds and mode round-trip through the state file and restore as remembered', () => {
  const dir = tempStateDir();
  const statePath = join(dir, WINDOW_STATE_FILE);
  const remembered = { x: 120, y: 80, width: 1400, height: 900, mode: 'windowed' };

  assert.equal(writeWindowStateFile(statePath, remembered), true);
  assert.equal(existsSync(statePath), true);
  const sanitized = sanitizeWindowState(readWindowStateFile(statePath), DISPLAYS);
  assert.deepEqual(sanitized, remembered);

  // Maximized and fullscreen carry their restore bounds through the same validation.
  const maximized = { x: 0, y: 0, width: 1920, height: 1040, mode: 'maximized' };
  writeWindowStateFile(statePath, maximized);
  assert.deepEqual(sanitizeWindowState(readWindowStateFile(statePath), DISPLAYS), maximized);
  const fullscreen = { x: 1920, y: 10, width: 2560, height: 1400, mode: 'fullscreen' };
  writeWindowStateFile(statePath, fullscreen);
  assert.deepEqual(sanitizeWindowState(readWindowStateFile(statePath), DISPLAYS), fullscreen);
});

test('an off-screen saved rect is clamped into the primary display instead of stranding the window', () => {
  // Far off-screen to the top-left.
  assert.deepEqual(
    sanitizeWindowState({ x: -5000, y: -5000, width: 1400, height: 900, mode: 'windowed' }, DISPLAYS),
    { x: 0, y: 0, width: 1400, height: 900, mode: 'windowed' },
  );
  // The secondary monitor went away: the remembered rect is now unreachable.
  assert.deepEqual(
    sanitizeWindowState({ x: 2400, y: 100, width: 1400, height: 900, mode: 'windowed' }, [DISPLAYS[0]]),
    { x: 0, y: 0, width: 1400, height: 900, mode: 'windowed' },
  );
  // Entirely past the right edge of every display with no visible slice: clamped. A rect keeping
  // a visible slice on the secondary stays where it was.
  assert.equal(
    sanitizeWindowState({ x: 5200, y: 100, width: 1400, height: 900, mode: 'windowed' }, DISPLAYS).x,
    0,
  );
  assert.deepEqual(
    sanitizeWindowState({ x: 3500, y: 100, width: 1400, height: 900, mode: 'windowed' }, DISPLAYS),
    { x: 3500, y: 100, width: 1400, height: 900, mode: 'windowed' },
  );
});

test('sizes clamp to the launcher minimums and the largest display; garbage reads as no memory', () => {
  const tooSmall = sanitizeWindowState({ x: 10, y: 10, width: 400, height: 300, mode: 'windowed' }, DISPLAYS);
  assert.equal(tooSmall.width, 1024);
  assert.equal(tooSmall.height, 640);
  const huge = sanitizeWindowState({ x: 10, y: 10, width: 99999, height: 99999, mode: 'windowed' }, DISPLAYS);
  assert.equal(huge.width, 2560);
  assert.equal(huge.height, 1440);

  // Mode vocabulary: anything else reads as windowed.
  assert.equal(sanitizeWindowState({ x: 10, y: 10, width: 1200, height: 800, mode: 'kiosk' }, DISPLAYS).mode, 'windowed');

  // Garbage in, honest "nothing remembered" out.
  assert.equal(readWindowStateFile(join(tempStateDir(), WINDOW_STATE_FILE)), null);
  assert.equal(sanitizeWindowState(null, DISPLAYS), null);
  assert.equal(sanitizeWindowState({ x: 10, y: 10, width: 1200, height: 800 }, []), null);
});

test('a corrupted state file reads as no memory, never as defaults pretending to be remembered', () => {
  const dir = tempStateDir();
  const statePath = join(dir, WINDOW_STATE_FILE);
  writeWindowStateFile(statePath, { x: 10, y: 10, width: 1200, height: 800, mode: 'windowed' });
  const { writeFileSync } = require('node:fs');
  writeFileSync(statePath, '{not json', 'utf8');
  assert.equal(readWindowStateFile(statePath), null);
  // And an array is not a window state.
  writeFileSync(statePath, '[1,2,3]', 'utf8');
  assert.equal(readWindowStateFile(statePath), null);
});

test('main.cjs wires the memory: restore validated against current displays, flush on close, evidence untouched', () => {
  assert.match(MAIN_SOURCE, /require\('\.\/windowState\.cjs'\)/);
  assert.match(MAIN_SOURCE, /sanitizeWindowState\(readWindowStateFile\(windowStatePath\), collectDisplayAreas\(\)\)/);
  assert.match(MAIN_SOURCE, /bindWindowStatePersistence\(win, windowStatePath\)/);
  assert.match(MAIN_SOURCE, /win\.on\('close', flush\)/);
  // Isolated evidence keeps its launch contract: a throwaway profile, no persistence.
  assert.match(MAIN_SOURCE, /launchConfig\.isolatedEvidence\s*\?\s*null\s*:\s*path\.join\(app\.getPath\('userData'\), WINDOW_STATE_FILE\)/);
  // The default launch shape is unchanged when nothing is remembered.
  assert.match(MAIN_SOURCE, /rememberedWindow\s*\?\s*rememberedWindow\.mode === 'fullscreen'\s*:\s*!launchConfig\.isolatedEvidence/);
});
