#!/usr/bin/env node
// BP-05.1 PKT-RITUAL verification.
//
// Headless proof for the first-15 ritual's backend runtime seams: onboarding
// must retain ctx.helpers/registry, B1 must spawn the derelict through the
// canonical helper, and B3 must spawn the nonlethal gunnery trainer without
// relying on browser/render boot.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { Masks } from '../src/core/entity.js';
import { onboarding } from '../src/systems/onboarding.js';

let sections = 0;

function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function makeHarness() {
  const bus = createBus();
  const state = {
    meta: { seed: 15015 },
    simTime: 0,
    settings: { gameplay: { tutorialHints: true } },
    player: { hints: {} },
    playerId: 'player',
    entities: new Map(),
    entityList: [],
    world: { activeSector: { stations: [], gates: [] } },
    nav: {},
    story: { beatIndex: 0 },
    onboarding: {
      active: true,
      finished: false,
      currentBeat: 1,
      beatDoneAt: {},
      firedFollowups: {},
      oreCollected: 0,
      pirateFled: false,
    },
  };
  let nextId = 1;
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        id: spec.id || `ritual_${nextId++}`,
        alive: spec.alive !== false,
        pos: spec.pos || { x: 0, z: 0 },
        vel: spec.vel || { x: 0, z: 0 },
        data: {},
        ...spec,
      };
      entity.data = { ...(spec.data || {}) };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  helpers.spawnEntity({
    id: 'player',
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    hull: 100,
    hullMax: 100,
    team: 1,
    data: { player: true },
  });
  helpers.spawnEntity({
    id: 'beacon',
    type: 'beacon',
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 16,
    data: { onboarding: true },
  });
  const registry = { get() { return null; } };
  const sys = Object.create(onboarding);
  sys.init({ state, bus, helpers, registry });
  return { sys, state, bus, helpers, registry, spawned };
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in proof ritual path'); };
  Date.now = () => { throw new Error('Date.now in proof ritual path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testHelperSeam);
guarded(testDerelictBeatSpawn);
guarded(testGunneryTrainerSpawn);
testRuntimeScope();

console.log(`[check-proof-ritual] PASS - ${sections} sections green`);

function testHelperSeam() {
  const h = makeHarness();
  assert.equal(h.sys.helpers, h.helpers, 'onboarding.init retains ctx.helpers for B1/B3 spawn helpers');
  assert.equal(h.sys.registry, h.registry, 'onboarding.init retains ctx.registry for B5 choice board lookup');
  ok('onboarding stores boot helpers and registry');
}

function testDerelictBeatSpawn() {
  const h = makeHarness();
  h.sys._spawnDerelict();
  const wreck = h.state.entityList.find((e) => e.type === 'wreck' && e.data && e.data.onboarding);
  assert.ok(wreck, 'B1 should spawn an onboarding derelict through helpers.spawnEntity');
  assert.equal(h.sys._derelictId, wreck.id, 'B1 stores the spawned derelict id');
  assert.equal(wreck.data.parentType, 'ship', 'derelict reads as a ship wreck, not an asteroid/mining node');
  const player = h.state.entities.get('player');
  const dist = Math.hypot(wreck.pos.x - player.pos.x, wreck.pos.z - player.pos.z);
  assert.equal(Math.round(dist), 80,
    'B1 derelict stays 80 WU from the live player, not from the old opening beacon');
  ok('B1 derelict runtime spawn is helper-backed and deterministic');
}

function testGunneryTrainerSpawn() {
  const h = makeHarness();
  const trainer = h.sys._spawnTrainer('burst');
  assert.ok(trainer, 'B3 should spawn its gunnery trainer through helpers.spawnEntity');
  assert.equal(trainer.name, 'SCN Gunnery Buoy', 'B3 names the visible training target');
  assert.equal(trainer.type, 'drone', 'B3 trainer uses the non-ship collision identity');
  assert.equal(trainer.flags.invuln, true, 'B3 trainer survives the burst lesson');
  assert.equal(trainer.data.ai.spawnContext, 'tutorial_training', 'B3 trainer has explicit tutorial provenance');
  assert.equal(trainer.data.ai.roe, 'hold_fire', 'B3 trainer cannot fire on the player');
  assert.deepEqual(trainer.data.weapons, [], 'B3 trainer is unarmed');
  assert.equal(trainer.collisionMask, Masks.PROJECTILE, 'B3 trainer accepts projectile hits only');
  ok('B3 gunnery trainer is helper-backed, nonlethal, and visible');
}

function testRuntimeScope() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:proof-ritual'], 'node scripts/check-proof-ritual.mjs',
    'package exposes check:proof-ritual');

  const onboardingSrc = readFileSync(new URL('../src/systems/onboarding.js', import.meta.url), 'utf8');
  const proofDoc = readFileSync(new URL('../design/revamp/PROOF_RITUAL.md', import.meta.url), 'utf8');
  assert.match(onboardingSrc, /this\.helpers = ctx\.helpers \|\| \{\}/,
    'onboarding keeps helper seam explicit');
  assert.match(onboardingSrc, /this\.registry = ctx\.registry \|\| null/,
    'onboarding keeps registry seam explicit');
  assert.match(proofDoc, /First-15 Proof Ritual/,
    'proof ritual doc names the shipped proof surface');
  assert.match(proofDoc, /B1.*derelict/i,
    'proof ritual doc names the derelict beat');
  assert.match(proofDoc, /B3.*Gunnery/i,
    'proof ritual doc names the live nonlethal gunnery beat');
  assert.doesNotMatch(onboardingSrc, /_spawnPirate|tutorial_pirate/,
    'the First Shift must not claim the retired armed-pirate tutorial path');
  ok('packet doc and package wiring are present');
}
