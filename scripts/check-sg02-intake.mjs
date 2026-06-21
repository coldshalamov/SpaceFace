import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RECOVERED_ZIP_SHA256 = '6D3FE3CFC805A6454459E220D24225BE2989C4B3DE3E572BD74EAA4456E474AF';

const REQUIRED_FULL_HANDOFF = Object.freeze([
  'docs/handoffs/SG-02_PHYSICS_HANDOFF.md',
  'third_party/reference-ledger-sg02.yml',
  'scripts/check-sg02-authority.mjs',
  'scripts/check-sg02-tether.mjs',
  'scripts/check-sg02-tether-break.mjs',
  'scripts/check-sg02-dash-collision.mjs',
]);

const DYNAMIC_RUNTIME_MARKERS = Object.freeze([
  ['src/core/physics.js', 'createRapierDynamicsWorld'],
  ['src/core/physics.js', 'rapier-dynamic'],
  ['src/core/physics.js', 'massline:attach'],
  ['src/core/rapierCollisionWorld.js', 'createRapierDynamicsWorld'],
  ['src/core/rapierCollisionWorld.js', 'PHYSICS_RUNTIME_SCHEMA_VERSION'],
  ['src/core/flightDynamics.js', 'writePhysicsControl'],
  ['src/core/flightDynamics.js', './physicsAuthority.js'],
  ['src/systems/flight.js', 'queuePhysicsImpulse'],
  ['src/systems/flight.js', '../core/physicsAuthority.js'],
]);

const packageJson = json('package.json');
const scripts = packageJson.scripts || {};

const hasMembrane = exists('src/core/physicsAuthority.js');
const hasDynamicLab = exists('src/core/sg02DynamicBodyOwner.js') || exists('scripts/check-sg02-dynamic-body-owner.mjs');
const hasFullHandoff = exists('docs/handoffs/SG-02_PHYSICS_HANDOFF.md');
const dynamicMarkers = activeDynamicMarkers();

if (hasMembrane) {
  assert(exists('scripts/check-physics-authority.mjs'), 'SG-02 membrane requires scripts/check-physics-authority.mjs');
  assert(scripts['check:physics-authority'], 'package.json must expose check:physics-authority');
  assert(scripts['check:sg02'] && scripts['check:sg02'].includes('check:physics-authority'),
    'package.json check:sg02 must include the physics-authority membrane gate');

  const intake = read('docs/handoffs/SG-02_RECOVERED_SOURCE_INTAKE.md');
  assert(intake.includes(RECOVERED_ZIP_SHA256), 'SG-02 intake doc must record the recovered zip hash');
  assert(intake.includes('not a merge-ready SG-02 handoff'), 'SG-02 intake doc must reject full acceptance of the partial recovery');
  assert(intake.includes('Accepted now') && intake.includes('Not accepted yet'),
    'SG-02 intake doc must separate accepted membrane work from rejected dynamic runtime work');
}

if (hasDynamicLab) {
  assert(exists('src/core/sg02DynamicBodyOwner.js'), 'SG-02 dynamic lab requires src/core/sg02DynamicBodyOwner.js');
  assert(exists('scripts/check-sg02-dynamic-body-owner.mjs'), 'SG-02 dynamic lab requires scripts/check-sg02-dynamic-body-owner.mjs');
  assert(scripts['check:sg02:dynamic-lab'], 'package.json must expose check:sg02:dynamic-lab');
  assert(scripts['check:sg02'] && scripts['check:sg02'].includes('check:sg02:dynamic-lab'),
    'package.json check:sg02 must include the dynamic-owner lab gate');

  const intake = read('docs/handoffs/SG-02_RECOVERED_SOURCE_INTAKE.md');
  assert(intake.includes('dynamic-owner lab'), 'SG-02 intake doc must record the accepted dynamic-owner lab boundary');
}

if (dynamicMarkers.length || hasFullHandoff) {
  for (const rel of REQUIRED_FULL_HANDOFF) {
    assert(exists(rel), `dynamic SG-02 landing requires ${rel}`);
  }
  assert(scripts['check:sg02'] && scripts['check:sg02'].includes('check-sg02-authority'),
    'dynamic SG-02 landing requires check:sg02 to run the authority acceptance suite');
  assert(scripts['check:sg02'] && scripts['check:sg02'].includes('check-sg02-tether'),
    'dynamic SG-02 landing requires check:sg02 to run the tether acceptance suite');
  assert(scripts['check:sg02'] && scripts['check:sg02'].includes('check-sg02-tether-break'),
    'dynamic SG-02 landing requires check:sg02 to run the Massline break telemetry suite');
  assert(hasFixtureFiles('test/sg02'), 'dynamic SG-02 landing requires at least one test/sg02 fixture');
  assertNoKinematicAuthority();
}

console.log('SG-02 intake checks OK');

function activeDynamicMarkers() {
  const hits = [];
  for (const [rel, marker] of DYNAMIC_RUNTIME_MARKERS) {
    if (!exists(rel)) continue;
    if (read(rel).includes(marker)) hits.push(`${rel}:${marker}`);
  }
  return hits;
}

function assertNoKinematicAuthority() {
  for (const rel of ['src/core/rapierCollisionWorld.js', 'src/core/physics.js']) {
    if (!exists(rel)) continue;
    const text = read(rel);
    assert(!text.includes('kinematicPositionBased'), `${rel} still creates kinematic Rapier bodies`);
    assert(!text.includes('setNextKinematicTranslation'), `${rel} still drives kinematic Rapier translations`);
  }
}

function hasFixtureFiles(rel) {
  if (!exists(rel)) return false;
  return readdirSync(abs(rel), { withFileTypes: true }).some((entry) => entry.isFile());
}

function read(rel) {
  return readFileSync(abs(rel), 'utf8');
}

function json(rel) {
  return JSON.parse(read(rel));
}

function exists(rel) {
  return existsSync(abs(rel));
}

function abs(rel) {
  return resolve(ROOT, rel);
}
