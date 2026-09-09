#!/usr/bin/env node
// scripts/check-encounter-shapes.mjs — encounter grammar validator.
// Verifies every authored encounter file declares a valid shape: situation × place × twist × actor.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIR = join(ROOT, 'src/data/encounters');
const MODULE_RE = /^\d{3}-[a-z0-9-]+\.js$/;

const {
  ENCOUNTERS,
  ENCOUNTER_MODULES,
} = await import('../src/data/encounters/index.generated.js');

const {
  validateEncounterShape,
  SITUATION_VOCABULARY,
  PLACE_VOCABULARY,
  TWIST_VOCABULARY,
  ACTOR_VOCABULARY,
} = await import('../src/data/encounters/catalog.js');

const authoredFiles = readdirSync(DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && MODULE_RE.test(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'en'));

if (authoredFiles.length !== ENCOUNTER_MODULES.length) {
  throw new Error(
    `Authored file count (${authoredFiles.length}) does not match index modules (${ENCOUNTER_MODULES.length}).`,
  );
}

const situations = new Set();
const places = new Set();
const twists = new Set();
const actors = new Set();

for (const [id, encounter] of Object.entries(ENCOUNTERS)) {
  if (!encounter.shape) {
    throw new Error(`Encounter "${id}" is missing required shape property.`);
  }

  validateEncounterShape(encounter.shape, id);

  situations.add(encounter.shape.situation);
  if (Array.isArray(encounter.shape.place)) {
    for (const p of encounter.shape.place) places.add(p);
  } else {
    places.add(encounter.shape.place);
  }
  twists.add(encounter.shape.twist);
  actors.add(encounter.shape.actor);
}

if (situations.size < 2) {
  throw new Error(`Grammar variety failure: only ${situations.size} distinct situation(s) found.`);
}
if (twists.size < 2) {
  throw new Error(`Grammar variety failure: only ${twists.size} distinct twist(s) found.`);
}
if (actors.size < 2) {
  throw new Error(`Grammar variety failure: only ${actors.size} distinct actor(s) found.`);
}

console.log('check:encounter-shapes');
console.log(`  PASS: ${ENCOUNTER_MODULES.length} authored encounter modules validated.`);
console.log(`  Distinct situations (${situations.size}): ${[...situations].sort().join(', ')}`);
console.log(`  Distinct places     (${places.size}): ${[...places].sort().join(', ')}`);
console.log(`  Distinct twists     (${twists.size}): ${[...twists].sort().join(', ')}`);
console.log(`  Distinct actors     (${actors.size}): ${[...actors].sort().join(', ')}`);
