// Every system in the production update order declares its mode scope and clock. The browser checks this at startup
// and refuses to boot a Swarm round otherwise (swarmCourseTwists, 2026-11-12); this runs the same check in Node so a
// new system's missing declaration fails here, not in a player's launch.
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSystemModeDeclarations, validateSystemClockDeclarations } from '../src/runtime/authoritativeSystemManifest.js';

test('every production system declares its mode scope', () => {
  assert.deepEqual(validateSystemModeDeclarations(), []);
});

test('every production system declares its clock', () => {
  assert.deepEqual(validateSystemClockDeclarations(), []);
});
