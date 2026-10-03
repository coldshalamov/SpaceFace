// FB-095 — wall-clock determinism guard (shared library).
//
// performance.now()/Date.now() are the same determinism failure class as a Math.random draw:
// a host-dependent value. Simulation-owner directories must not invoke them directly.
// Diagnostics that genuinely need wall time read it through perfNow() in
// src/core/perfRuntime.js — the single classified instrumentation seam. Every file in
// ALLOWED_WALL_TIME_FILES carries its written classification in
// docs/Spec/PHASE0_AUTHORITY_AUDIT.md (Wall-Clock Catalogue).
//
// This module is the shared engine: scripts/check-phase0-slice-contract.mjs asserts the real
// tree is clean; test/fb-determinism-wall-time-guard.test.mjs proves a planted Date.now() in a
// sim-owner directory is flagged.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// The invocation (`performance.now(` / `Date.now(`) is the act. A bare reference or a mention
// inside a stripped comment is not a read — matching the call keeps this guard from
// false-positiving on its own classification prose.
export const WALL_TIME_INVOCATION = /(?:performance\.now|Date\.now)\s*\(/;

export const WALL_TIME_SCAN_DIRS = Object.freeze([
  'src/systems',
  'src/core',
  'src/ai',
  'src/combat',
  'src/world',
]);

export const ALLOWED_WALL_TIME_FILES = new Map([
  // Instrumentation seam: the exported wall clock for diagnostics. physics.js / flightV3.js /
  // flight.js call perfNow() for _diag.tickMs instead of touching wall time themselves.
  ['src/core/perfRuntime.js', 'perf instrumentation clock; perfNow() is the sanctioned diagnostic seam'],
  ['src/core/loop.js', 'frame driver: wall/elapsed stamps only feed the fixed-step accumulator'],
  ['src/core/presentationRunner.js', 'presentation runner pacing/diagnostics; owns no sim outcomes'],
  ['src/core/runtimeWitness.js', '1 Hz flight-recorder instrumentation; wall stamps label human-facing reports'],
  ['src/core/renderUpdatePhase.js', 'render-phase timing instrumentation'],
  ['src/core/bootScheduler.js', 'boot scheduling instrumentation; no sim ownership'],
  // Input-device adapters: real hardware event timing is inherently wall-clock, and these
  // stamps are diagnostic-only — input.js keeps the wall stamp off serialized state;
  // gamepad.js/touch.js mark lastActiveMs "diagnostic only"; gamepad's self-benchmark
  // measures its own tick cost.
  ['src/systems/input.js', 'input->photon latency stamp; measurement-only, never serialized or read by gameplay'],
  ['src/systems/gamepad.js', 'gamepad device diagnostic stamp + idle-skip self-benchmark'],
  ['src/systems/touch.js', 'touch device diagnostic stamp (ev.timeStamp preferred; wall is fallback)'],
  ['src/systems/telemetry.js', 'local telemetry session id and human-readable duration listing'],
  // The ONE sanctioned sim-adjacent exception: offline catch-up may read wall time only under
  // settings.gameplay.wallClockOfflineProgress === true (explicit host opt-in; lab/deterministic
  // runs leave it off and resolve "now" from sim-time baselines).
  ['src/systems/automation.js', 'opt-in offline-progress exception: Date.now only under wallClockOfflineProgress === true'],
]);

/**
 * Scan relDir (relative to root) for active wall-clock invocations.
 * Returns [{ rel, line }] with POSIX-style rel paths.
 */
export function scanWallTimeSites(root, relDir) {
  const out = [];
  const abs = resolve(root, relDir);
  try {
    walk(abs, (file) => {
      if (!/\.(js|mjs)$/.test(file)) return;
      const rel = relative(root, file).replace(/\\/g, '/');
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
        const code = lines[i].replace(/\/\/.*$/, '');
        if (WALL_TIME_INVOCATION.test(code)) out.push({ rel, line: i + 1 });
      }
    });
  } catch (err) {
    if (err && err.code === 'ENOENT') return out; // missing scan dir (e.g. src/ai in a fixture root)
    throw err;
  }
  return out;
}

/** Every wall-clock site across the scan dirs that carries no classification. */
export function unclassifiedWallTimeSites(root, dirs = WALL_TIME_SCAN_DIRS) {
  const out = [];
  for (const dir of dirs) {
    for (const site of scanWallTimeSites(root, dir)) {
      if (!ALLOWED_WALL_TIME_FILES.has(site.rel)) out.push(site);
    }
  }
  return out;
}

function walk(dir, visit) {
  for (const ent of readdirSync(dir)) {
    const abs = join(dir, ent);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, visit);
    else visit(abs);
  }
}
