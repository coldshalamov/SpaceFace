#!/usr/bin/env node
// M3 starter-build contract: four reachable Hitch fits, truthful through live fitting/preview owners.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import {
  ORIGIN_PHYSICAL_IDENTITIES,
  ORIGIN_ROLE_KITS,
} from '../src/careers/origins/careerOriginContracts.js';
import { MODULES } from '../src/data/modules.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SHIPS } from '../src/data/ships.js';
import {
  STARTER_BUILD_BY_ID,
  STARTER_BUILDS,
  STARTER_BUILDS_SCHEMA_ID,
  getStarterBuild,
} from '../src/data/starterBuilds.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  buildSlotList,
  fits,
  fittingsFromDefaultModules,
  getDerivedStats,
  makeShipEntitySpec,
} from '../src/systems/ships.js';
import {
  presentDerivedReadout,
  presentLoadoutDelta,
  presentModuleFitPreview,
} from '../src/ui/presenters/engineeringPreview.js';

const source = readFileSync(new URL('../src/data/starterBuilds.js', import.meta.url), 'utf8');
const hitch = SHIPS.find((entry) => entry.id === 'ship_kestrel');
const FITTABLE = new Map([...WEAPONS, ...MODULES].map((entry) => [entry.id, entry]));
const CAREERS = Object.freeze(['hauler', 'hunter', 'prospector']);
const REQUIRED_FIELDS = Object.freeze([
  'id', 'label', 'shipId', 'careerId', 'verb', 'fittings', 'acquisition', 'benefit', 'tradeoff',
]);

let sections = 0;
function pass(label) {
  sections += 1;
  console.log(`  PASS ${label}`);
}

function assertDeepFrozen(value, path = 'value') {
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object') assertDeepFrozen(child, `${path}.${key}`);
  }
}

function placedFit(entry) {
  const placed = fittingsFromDefaultModules(entry.shipId, entry.fittings);
  assert.equal(placed.filter(Boolean).length, entry.fittings.length,
    `${entry.id}: every declared module must reach a slot`);
  return placed;
}

function derivedDigest(derived) {
  return JSON.stringify({
    mass: derived.mass,
    turnRate: derived.turnRate,
    maxSpeed: derived.maxSpeed,
    continuousDrain: derived.continuousDrain,
    tetherSpoolMult: derived.tetherSpoolMult,
    tetherReelRateMult: derived.tetherReelRateMult,
  });
}

assert.equal(STARTER_BUILDS_SCHEMA_ID, 'spaceface.starterBuilds.v1');
assert.equal(STARTER_BUILDS.length, 4, 'exactly four starter builds');
assertDeepFrozen(STARTER_BUILDS, 'STARTER_BUILDS');
assertDeepFrozen(STARTER_BUILD_BY_ID, 'STARTER_BUILD_BY_ID');
for (const entry of STARTER_BUILDS) {
  assert.deepEqual(Object.keys(entry), REQUIRED_FIELDS, `${entry.id}: exact public fields`);
  assert.ok(entry.id && entry.label && entry.shipId && entry.verb && entry.benefit && entry.tradeoff);
  assert.equal(entry.shipId, NEW_GAME.shipId);
  assert.ok(Array.isArray(entry.fittings) && entry.fittings.length >= 4);
  assert.equal(new Set(entry.fittings).size, entry.fittings.length, `${entry.id}: no duplicate fitting ids`);
  assert.equal(getStarterBuild(entry.id), entry, `${entry.id}: indexed reachability`);
}
assert.equal(new Set(STARTER_BUILDS.map((entry) => entry.id)).size, 4, 'build ids unique');
assert.equal(new Set(STARTER_BUILDS.map((entry) => entry.label)).size, 4, 'build labels unique');
pass('schema, exact field shape, indexing, and deep immutability');

const generalist = getStarterBuild('starter_generalist');
assert.deepEqual([...generalist.fittings], NEW_GAME.fittedModules,
  'generalist is the exact canonical NEW_GAME fit');
assert.equal(generalist.careerId, null);
assert.deepEqual(generalist.acquisition, { source: 'new_game', careerId: null, moduleId: null });
for (const careerId of CAREERS) {
  const entry = getStarterBuild(`starter_${careerId}`);
  const kit = ORIGIN_ROLE_KITS[careerId];
  const identity = ORIGIN_PHYSICAL_IDENTITIES[careerId];
  assert.equal(entry.careerId, careerId);
  assert.equal(entry.verb, identity.verb);
  assert.equal(identity.loadout, kit, `${careerId}: physical origin uses canonical role kit`);
  assert.deepEqual([...entry.fittings], [...NEW_GAME.fittedModules, kit.defId]);
  assert.deepEqual(entry.acquisition, {
    source: 'career_origin', careerId, moduleId: kit.defId,
  });
  assert.doesNotMatch(`${entry.benefit} ${entry.tradeoff}`, /market intel|ram damage|route intelligence/i,
    `${careerId}: build copy cannot advertise unconsumed module metadata`);
}
assert.equal(new Set(CAREERS.map((id) => getStarterBuild(`starter_${id}`).acquisition.moduleId)).size, 3,
  'career origins award three competing modules');
pass('generalist and canonical non-binding origin acquisition reachability');

const slots = buildSlotList(hitch);
assert.equal(slots.filter((slot) => slot.type === 'utility').length, 1,
  'Hitch has one real utility slot, so career kits remain mutually exclusive');
const placedById = new Map();
for (const entry of STARTER_BUILDS) {
  const placed = placedFit(entry);
  placedById.set(entry.id, placed);
  for (let index = 0; index < placed.length; index += 1) {
    const moduleId = placed[index];
    if (!moduleId) continue;
    const def = FITTABLE.get(moduleId);
    assert.ok(def, `${entry.id}: ${moduleId} exists`);
    assert.equal(fits(slots[index], def), true, `${entry.id}: ${moduleId} fits slot ${index}`);
  }
}
for (const careerId of CAREERS) {
  const entry = getStarterBuild(`starter_${careerId}`);
  const preview = presentModuleFitPreview({
    defId: entry.shipId,
    fittings: placedById.get(generalist.id),
    moduleId: entry.acquisition.moduleId,
  });
  assert.equal(preview.ok, true, `${entry.id}: engineering preview finds its utility slot`);
  assert.equal(preview.mode, 'install');
}
pass('module existence, slot-size compatibility, and mutual exclusion');

const derivedById = new Map();
for (const entry of STARTER_BUILDS) {
  const fit = placedById.get(entry.id);
  const derived = getDerivedStats(entry.shipId, fit, null);
  derivedById.set(entry.id, derived);
  const preview = presentDerivedReadout(entry.shipId, fit, null);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.fittings, fit, `${entry.id}: preview uses the real placed fit`);
  assert.equal(preview.derived.mass, derived.mass);
  assert.equal(preview.derived.maxSpeed, derived.maxSpeed);
  assert.equal(preview.derived.turnRate, derived.turnRate);
  assert.equal(preview.derived.continuousDrain, derived.continuousDrain);
}
assert.equal(new Set([...derivedById.values()].map(derivedDigest)).size, 4,
  'all four live derived capability packets differ');
const baseDerived = derivedById.get(generalist.id);
for (const careerId of CAREERS) {
  const entry = getStarterBuild(`starter_${careerId}`);
  const derived = derivedById.get(entry.id);
  assert.notEqual(derivedDigest(derived), derivedDigest(baseDerived), `${careerId}: differs from generalist`);
  const delta = presentLoadoutDelta({
    defId: entry.shipId,
    beforeFittings: placedById.get(generalist.id),
    afterFittings: placedById.get(entry.id),
  });
  assert.equal(delta.ok, true);
  assert.ok(delta.rows.some((row) => Math.abs(row.delta) > 1e-6), `${careerId}: truthful visible delta`);
}
const haulerDerived = derivedById.get('starter_hauler');
const hunterDerived = derivedById.get('starter_hunter');
const prospectorDerived = derivedById.get('starter_prospector');
assert.ok(baseDerived.maxSpeed > haulerDerived.maxSpeed && baseDerived.turnRate > haulerDerived.turnRate,
  'open generalist utility slot preserves the Hitch baseline handling benefit');
assert.ok(haulerDerived.maxSpeed > hunterDerived.maxSpeed && haulerDerived.maxSpeed > prospectorDerived.maxSpeed,
  'light hauler role kit preserves the best speed of the three career fits');
assert.ok(haulerDerived.turnRate > hunterDerived.turnRate && haulerDerived.turnRate > prospectorDerived.turnRate,
  'light hauler role kit preserves the best turn authority of the three career fits');
assert.ok(hunterDerived.operationalMass > haulerDerived.operationalMass
  && hunterDerived.operationalMass > prospectorDerived.operationalMass,
  'hunter role kit supplies the greatest physical mass of the three career fits');
const hunterEntity = makeShipEntitySpec(getStarterBuild('starter_hunter').shipId, {
  fittings: placedById.get('starter_hunter'), isPlayer: true,
});
const hunterBody = ensurePhysicsBodySpec(hunterEntity);
assert.equal(hunterEntity.mass, hunterDerived.operationalMass, 'ships copies hunter mass onto the entity');
assert.equal(hunterBody.mass, hunterDerived.operationalMass, 'physics consumes the hunter entity mass');

const standardTether = ATTACHMENT_DEFS.find((entry) => entry.id === 'tether_standard');
assert.ok(standardTether, 'standard tether definition exists');
const baseTether = effectiveTetherPolicy(standardTether, { data: { derived: baseDerived } });
const prospectorTether = effectiveTetherPolicy(standardTether, { data: { derived: prospectorDerived } });
assert.ok(prospectorTether.reelRate > baseTether.reelRate,
  'live attachment service consumes prospector reel-rate benefit');
assert.ok(prospectorTether.break.maxTension > baseTether.break.maxTension,
  'live attachment service consumes prospector line-strength benefit');
assert.ok(prospectorTether.break.maxImpulse > baseTether.break.maxImpulse,
  'live attachment service consumes prospector impulse-tolerance benefit');
pass('advertised capabilities reach real flight, physics, and Massline consumers');

const jsonA = JSON.stringify(STARTER_BUILDS);
const jsonB = JSON.stringify(STARTER_BUILDS);
assert.equal(jsonA, jsonB, 'serialization is deterministic');
assert.deepEqual(JSON.parse(jsonA), STARTER_BUILDS, 'starter build data JSON-roundtrips exactly');
assert.deepEqual(STARTER_BUILDS.map((entry) => entry.id), [
  'starter_generalist', 'starter_hauler', 'starter_hunter', 'starter_prospector',
]);
pass('deterministic ordering and JSON roundtrip');

assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now/,
  'starter build data cannot draw random or wall-clock state');
assert.doesNotMatch(source, /\b(?:state|player)\.[A-Za-z_$][\w$]*\s*(?:=|\+\+|--)/,
  'starter build data cannot write gameplay authorities');
assert.doesNotMatch(source, /\.emit\(|localStorage|document\.|window\./,
  'starter build data cannot emit or own runtime/UI persistence');
assert.match(source, /NEW_GAME\.fittedModules/);
assert.match(source, /ORIGIN_ROLE_KITS\[careerId\]/);
pass('pure-data authority and forbidden-write guard');

const persistence = spawnSync(process.execPath, ['--test', 'test/m3-role-kit-save-load.test.mjs'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
});
assert.equal(persistence.status, 0,
  `real ships grant + save/load persistence failed:\n${persistence.stdout || ''}${persistence.stderr || ''}`);
pass('real ships grant events, receipts, and Continue persistence');

console.log(`[check-m3-starter-builds] PASS — ${sections} sections, ${STARTER_BUILDS.length} builds`);
