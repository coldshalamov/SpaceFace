#!/usr/bin/env node
// check:player-motion — R23 tripwire: nothing outside the flight controllers and the
// physics membrane writes the player ship's vel / angVel / heading / position directly.
// Forces on the hull go through queuePhysicsImpulse (src/core/physicsAuthority.js) with
// provenance, or they are deleted. This scans every file under src/systems for a direct
// write through a `player` binding and fails on any line not on the allow-list below.
//
// Known limits (deliberate, to keep the lint cheap): it matches the `player.` naming
// convention every system here already uses, not aliases; pose snaps written through an
// `entity` binding (phaseBlink's adoptPose, the physics owner's mirror) are the player's
// own verbs or the solver's own hand and are out of scope by design.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = path.join(root, 'src', 'systems');

// The legitimate owners. Each entry allows exact trimmed lines only: a new direct write,
// even inside an allowed file, still fails until it is named here with a reason.
const ALLOWED_WRITERS = [
  {
    file: 'src/systems/world.js',
    why: 'applySameSectorPlayerRelocation — sector entry/respawn transition the player started (R23 scripted moment)',
    lines: [
      'player.pos.x = x;',
      'player.pos.z = z;',
      'player.pos.y = 0;',
      'if (!player.vel) player.vel = { x: 0, y: 0, z: 0 };',
      'player.vel.x = 0;',
      'player.vel.y = 0;',
      'player.vel.z = 0;',
      'player.angVel = 0;',
      'player.rot = heading;',
    ],
  },
  {
    file: 'src/systems/uniqueLootAbilities.js',
    why: 'pale-coil blink — the player fires the fitted item; a pose snap, not a shove',
    lines: [
      'player.pos.x = from.x + Math.cos(heading) * PALE_COIL_BLINK_DISTANCE;',
      'player.pos.z = from.z + Math.sin(heading) * PALE_COIL_BLINK_DISTANCE;',
    ],
  },
  {
    file: 'src/systems/plants/mercies/pl367LingeringLift.js',
    why: 'the lingering-lift car the player boarded carries them up its spine — a ride the player started',
    lines: [
      'player.pos.x = cp.x;',
      'player.pos.z = cp.z;',
    ],
  },
  {
    file: 'src/systems/theBolus.js',
    why: 'vel object initialization only (no motion change); forces go through queuePhysicsImpulse',
    lines: [
      'if (!player.vel) player.vel = { x: 0, y: 0, z: 0 };',
    ],
  },
];

// A direct write to the player's motion state: player.vel(.x|.z) <op>= ..., and the same
// for angVel / heading / pos / rot. Comparisons (==, ===, =>) are not writes.
const WRITE = /\bplayer\s*\.\s*(?:vel|angVel|heading|pos|rot)(?:\s*\.\s*[xyzwy])?\s*(?:\+=|-=|\*=|\/=|=)(?![=>])/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const allowByFile = new Map();
for (const entry of ALLOWED_WRITERS) allowByFile.set(entry.file, new Set(entry.lines));
const violations = [];
for (const full of walk(SCAN_ROOT)) {
  const rel = path.relative(root, full).split(path.sep).join('/');
  const allowed = allowByFile.get(rel);
  const lines = readFileSync(full, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (!WRITE.test(text)) continue;
    if (allowed && allowed.has(text.trim())) continue;
    violations.push(`${rel}:${i + 1}: ${text.trim()}`);
  }
}

if (violations.length) {
  console.error('check:player-motion — direct player-motion writes outside the allow-list:');
  for (const v of violations) console.error(`  ${v}`);
  console.error('Route the force through queuePhysicsImpulse with provenance and a visible');
  console.error('source, or delete the shove. If the writer is a legitimate owner, name the');
  console.error('exact line in ALLOWED_WRITERS in scripts/check-player-motion-writers.mjs with a reason.');
  process.exit(1);
}
const allowedCount = [...allowByFile.values()].reduce((n, set) => n + set.size, 0);
console.log(`check:player-motion — clean (${ALLOWED_WRITERS.length} owners, ${allowedCount} allowed lines).`);
