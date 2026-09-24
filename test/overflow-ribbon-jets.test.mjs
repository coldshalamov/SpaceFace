// Overflow ships draw a short swept ribbon, or nothing. They do not fall back to
// camera-facing flashes and particle needles. The player jet and its flight history stay put.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as THREE from 'three';

import { vfx } from '../src/render/vfx.js';
import { RIBBON_ACROSS, RIBBON_COUNT, STATION_COUNT } from '../src/render/thruster/ribbon/plasmaRibbons.js';
import {
  productionPlayerReverseNeedleSprites,
  reverseNeedleEmissionAllowed,
} from '../src/render/thruster/systems/playerRetroVolume.js';
import {
  OVERFLOW_DRIVE_CAPACITY,
  OVERFLOW_JET_ACROSS,
  OVERFLOW_JET_RIBBONS,
  OVERFLOW_JET_STATIONS,
  OVERFLOW_ROLE_MAIN,
  OverflowRibbonJets,
} from '../src/render/thruster/systems/overflowRibbonJets.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function sliceFn(source, name, nextName) {
  const start = source.indexOf(`  ${name}(`);
  const end = source.indexOf(`  ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} source span`);
  return source.slice(start, end);
}

test('overflow jet reuses the swept sheet at a lower station count', () => {
  assert.ok(OVERFLOW_JET_STATIONS < STATION_COUNT);
  assert.ok(OVERFLOW_JET_RIBBONS < RIBBON_COUNT);
  assert.ok(OVERFLOW_JET_ACROSS >= 3 && OVERFLOW_JET_ACROSS < RIBBON_ACROSS);
  const pool = new OverflowRibbonJets(THREE, { driveCapacity: 2, ventCapacity: 2 });
  const slot = pool.claim(7, OVERFLOW_ROLE_MAIN, 4);
  assert.equal(slot.plume.stations, OVERFLOW_JET_STATIONS);
  assert.equal(slot.plume.ribbons, OVERFLOW_JET_RIBBONS);
  assert.equal(slot.plume.inspect().construction, 'swept-ribbon-sheets');
  const again = pool.claim(7, OVERFLOW_ROLE_MAIN, 4);
  assert.equal(again, slot, 'the same ship keeps its slot');
  const other = pool.claim(8, OVERFLOW_ROLE_MAIN, 9);
  assert.notEqual(other, slot);
  assert.equal(pool.claim(9, OVERFLOW_ROLE_MAIN, 40), null, 'a farther ship is not given a sprite either');
  const nearer = pool.claim(10, OVERFLOW_ROLE_MAIN, 1);
  assert.equal(nearer.entityId, 10, 'a nearer ship takes the farthest held slot');
  assert.equal(pool.driveSlots.length, 2);
  slot.shape.drive = 1;
  slot.shape.jetLength = 8;
  slot.baseRadiance = 1;
  pool.endFrame(1 / 60, null, 1, 1);
  assert.equal(slot.plume.mesh.visible, true);
  pool.dispose();
});

test('player production reverse still admits zero needle sprites', () => {
  assert.equal(reverseNeedleEmissionAllowed(true), false);
  assert.equal(productionPlayerReverseNeedleSprites(), 0);
  const vfxSource = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
  assert.match(vfxSource, /reverseNeedleEmissionAllowed\(this\._usesProductionThruster/);
  const reverseFn = sliceFn(vfxSource, '_emitReverseNozzleTrail', '_onBoost');
  const driveFn = sliceFn(vfxSource, '_emitEngineTrail', '_ensureOverflowJets');
  assert.doesNotMatch(reverseFn, /_spawnSprite|_spawnParticle/);
  assert.doesNotMatch(driveFn, /_spawnTrailStreak|_spawnSprite|_spawnParticle/);
  const retro = readFileSync(resolve(ROOT, 'src/render/thruster/systems/playerRetroVolume.js'), 'utf8');
  assert.match(retro, /PlasmaRibbonPlume/);
  assert.doesNotMatch(retro, /new VolumetricPlumeSystem/);
});

test('overflow drive and reverse do not stack sprites, and a full pool stays quiet', () => {
  const system = Object.create(vfx);
  const npc = {
    id: 2, type: 'ship', alive: true,
    pos: { x: 12, z: 0 }, vel: { x: 20, z: 0 }, rot: 0, radius: 6, flags: {},
  };
  const far = {
    id: 9, type: 'ship', alive: true,
    pos: { x: 400, z: 0 }, vel: { x: 20, z: 0 }, rot: 0, radius: 6, flags: {},
  };
  system.state = {
    playerId: 1,
    entities: new Map([[1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, rot: 0 }], [npc.id, npc], [far.id, far]]),
  };
  system._scene = {};
  system._spawnLocalXZ = { x: 0, z: 0 };
  system._factionRgbScratch = { r: 0.2, g: 0.6, b: 1 };
  system._trailSpawnScratch = { particles: 4, streaks: 4 };
  system._trailSocketWorldPose = () => null;
  let streaks = 0;
  let particles = 0;
  let sprites = 0;
  system._spawnTrailStreak = () => { streaks += 1; };
  system._spawnParticle = () => { particles += 1; };
  system._spawnSprite = () => { sprites += 1; };

  const player = { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 30, z: 0 }, rot: 0, radius: 6, flags: {} };
  system._emitEngineTrail(player, 1, 1 / 60);
  system._emitReverseNozzleTrail(player, 'reverse-left', 1);
  assert.equal(streaks + particles + sprites, 0, 'production player does not stack a sprite on the jet');
  assert.deepEqual(system._trailSpawnScratch, { particles: 0, streaks: 0 });

  system._overflowJets = new OverflowRibbonJets(THREE, { driveCapacity: 1, ventCapacity: 2 });
  system._emitEngineTrail(npc, 1, 1 / 60);
  system._emitReverseNozzleTrail(npc, 'reverse-left', 0.8);
  system._emitEngineTrail(far, 1, 1 / 60);
  assert.equal(streaks + particles + sprites, 0, 'rejected overflow ships stay quiet');
  const main = system._overflowJets.driveSlots.find((slot) => slot.role === OVERFLOW_ROLE_MAIN);
  assert.ok(main && main.entityId === npc.id, 'the nearer ship keeps the only drive slot');
  assert.ok(main.shape.jetLength > 4 && main.shape.jetLength < 14, 'overflow jet stays a jet, not the long wake');
  system._overflowJets.dispose();
});

test('weapon vent uses lateral sheets when the pool exists, and puffs only when it does not', () => {
  const owner = { id: 4, type: 'ship', pos: { x: 3, z: 1 }, rot: 0.4, radius: 5 };
  const system = Object.create(vfx);
  system.state = { playerId: 1, entities: new Map([[owner.id, owner]]) };
  system._scene = {};
  system._spawnLocalXZ = { x: 0, z: 0 };
  let sprites = 0;
  system._spawnSprite = () => { sprites += 1; };
  system._overflowJets = null;
  system._onWeaponVent({ phase: 'start', ownerId: owner.id });
  assert.ok(sprites >= 4, 'without a ribbon pool the old vent is left alone');

  sprites = 0;
  system._overflowJets = new OverflowRibbonJets(THREE, { driveCapacity: 1, ventCapacity: 2 });
  system._onWeaponVent({ phase: 'start', ownerId: owner.id });
  assert.equal(sprites, 0, 'a live pool replaces the puff silhouette');
  const live = system._overflowJets.ventSlots.filter((slot) => slot.life > 0);
  assert.equal(live.length, 2, 'port and starboard sheets');
  assert.ok(live.every((slot) => slot.shape.jetLength < 6 && slot.shape.jetLength > 2));
  system._overflowJets.dispose();
});

test('drive pool capacity stays the fixed table', () => {
  assert.equal(OVERFLOW_DRIVE_CAPACITY, 12);
});
