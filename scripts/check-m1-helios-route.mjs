#!/usr/bin/env node
/**
 * W1 M1 Helios route gate (focused production path).
 *
 * Primary proof: seed-47 Kestrel + authored Helios belt under live flightV3 + Rapier
 * must enter the physical dock envelope (same geometry that historically orbited ~294 WU).
 *
 * Full uninjected browser New Game→map→dock remains complementary public evidence;
 * this gate fails closed on the REAL product failure (terminal overspeed orbit).
 *
 * Usage: npm run check:m1:helios-route
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Reuse the full autopilot suite (Check 0 is Helios terminal). Isolated name for program matrix.
const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts/check-autopilot-v3.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
  env: process.env,
  timeout: 180_000,
});

const out = `${result.stdout || ''}${result.stderr || ''}`;
process.stdout.write(result.stdout || '');
if (result.stderr) process.stderr.write(result.stderr);

assert.equal(result.status, 0, `check:autopilot failed (Helios terminal is Check 0):\n${out.slice(-2000)}`);
assert.match(out, /Check 0 PASSED/, 'Helios terminal Check 0 must pass for M1 route gate');
assert.match(out, /ALL V3 AUTOPILOT CHECKS PASSED/, 'full autopilot suite must stay green');

// Source contract: terminal flyby capture remains in product path
import { readFileSync } from 'node:fs';
const flight = readFileSync(resolve(ROOT, 'src/systems/flightV3.js'), 'utf8');
assert.match(flight, /flybyOrbit/, 'flightV3 must keep lateral/away flyby capture braking');
assert.match(flight, /approachBand/, 'flightV3 must suppress boost inside approach band');

console.log('check:m1:helios-route OK — Helios terminal dock envelope + flyby capture contract green');
