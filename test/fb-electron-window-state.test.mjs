// FB-106 — The desktop shell remembers window bounds and mode, and Settings has a window-mode row
//
// Pins:
// 1. readWindowStateFile and writeWindowStateFile round-trip state cleanly to disk.
// 2. sanitizeWindowState clamps an off-screen saved rect into the primary display's work area.
// 3. sanitizeWindowState preserves valid on-screen bounds and valid modes (windowed/maximized/fullscreen).
// 4. sanitizeWindowState enforces minimum dimensions (MIN_WIDTH x MIN_HEIGHT).
// 5. sanitizeWindowState returns null for malformed or empty state (never invents defaults).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  MIN_WIDTH,
  MIN_HEIGHT,
  MODES,
  readWindowStateFile,
  sanitizeWindowState,
  writeWindowStateFile,
} from '../electron/windowState.cjs';

const mockDisplays = [
  {
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  },
  {
    bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
    workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
  },
];

test('FB-106: window state file round-trips to disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-window-state-'));
  const filePath = path.join(tmpDir, 'window-state.json');

  try {
    // Missing file returns null
    assert.equal(readWindowStateFile(filePath), null);

    const state = { x: 120, y: 80, width: 1480, height: 920, mode: 'windowed' };
    const written = writeWindowStateFile(filePath, state);
    assert.equal(written, true, 'File successfully written');

    const restored = readWindowStateFile(filePath);
    assert.deepEqual(restored, state, 'Read matches written state');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('FB-106: sanitizeWindowState preserves valid bounds and mode', () => {
  const raw = { x: 200, y: 150, width: 1400, height: 850, mode: 'windowed' };
  const sanitized = sanitizeWindowState(raw, mockDisplays);

  assert.ok(sanitized);
  assert.equal(sanitized.x, 200);
  assert.equal(sanitized.y, 150);
  assert.equal(sanitized.width, 1400);
  assert.equal(sanitized.height, 850);
  assert.equal(sanitized.mode, 'windowed');

  // Maximized and fullscreen modes preserve their mode tag
  for (const mode of ['maximized', 'fullscreen']) {
    const res = sanitizeWindowState({ ...raw, mode }, mockDisplays);
    assert.equal(res.mode, mode);
  }
});

test('FB-106: off-screen saved rect is clamped into the primary work area', () => {
  // A window saved on a disconnected monitor at x: 8000, y: 8000
  const offScreen = { x: 8000, y: 8000, width: 1280, height: 720, mode: 'windowed' };
  const clamped = sanitizeWindowState(offScreen, mockDisplays);

  assert.ok(clamped, 'Window state rescued');
  assert.equal(clamped.x, mockDisplays[0].workArea.x, 'Pinned to primary work area X');
  assert.equal(clamped.y, mockDisplays[0].workArea.y, 'Pinned to primary work area Y');
  assert.equal(clamped.width, 1280, 'Width preserved');
  assert.equal(clamped.height, 720, 'Height preserved');
});

test('FB-106: minimum dimensions are enforced and invalid modes sanitized', () => {
  const tooSmall = { x: 50, y: 50, width: 400, height: 300, mode: 'invalid_mode' };
  const sanitized = sanitizeWindowState(tooSmall, mockDisplays);

  assert.ok(sanitized);
  assert.equal(sanitized.width, MIN_WIDTH, 'Width clamped to minimum');
  assert.equal(sanitized.height, MIN_HEIGHT, 'Height clamped to minimum');
  assert.equal(sanitized.mode, 'windowed', 'Invalid mode falls back to windowed');
});

test('FB-106: malformed or empty state returns null', () => {
  assert.equal(sanitizeWindowState(null, mockDisplays), null);
  assert.equal(sanitizeWindowState(undefined, mockDisplays), null);
  assert.equal(sanitizeWindowState('not an object', mockDisplays), null);
  assert.equal(sanitizeWindowState([], mockDisplays), null);
  assert.equal(sanitizeWindowState({}, []), null, 'No displays returns null');
});
