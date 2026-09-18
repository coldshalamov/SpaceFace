// Leftover 60 Hz fat-list walks: aperture occupancy, NEAR slice, fodder hazards.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aperturePoint,
  isApertureOccupant,
} from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import {
  NEAR_WORK_TOKEN_BUDGET,
  takeNearWorkSlice,
} from '../src/core/activityScheduler.js';
import { createFodderCohortDirector } from '../src/ai/fodderCohort.js';
import {
  DEFAULT_QUALITY_PRESET,
  QUALITY_PRESETS,
  qualityTierForPreset,
} from '../src/render/adaptiveQuality.js';
import { createBus } from '../src/core/eventBus.js';
import { packCombatTable, queryCombatTableEntities, COMBAT_TABLE_FLAGS } from '../src/core/combatTable.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('uncovered aperture occupancy walks occupant buckets, not the fat list', () => {
  const wreck = {
    id: 9, type: 'wreck', alive: true, collides: true, pos: aperturePoint(0, 0),
  };
  const dressing = {
    id: 10, type: 'fx', alive: true, collides: true, pos: aperturePoint(0, 0),
  };
  assert.equal(isApertureOccupant(wreck), true);
  assert.equal(isApertureOccupant(dressing), false);
  const state = {
    playerId: 1,
    entityList: [dressing],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      ships: [],
      wrecks: [wreck],
      asteroids: [],
    },
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, pos: { x: 8000, z: 8000 } }]]),
  };
  const system = Object.create(environmentalMachinery);
  system._apertureLastOccupant = null;
  assert.equal(system._apertureOccupied(state), true, 'typed wreck bucket still jams the mouth');
});

test('NEAR owner slice still resumes leftover work after scratch reuse', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: 200 - i }));
  const state = {};
  const first = takeNearWorkSlice(state, 'traffic', items);
  const second = takeNearWorkSlice(state, 'traffic', items);
  assert.equal(first.length, NEAR_WORK_TOKEN_BUDGET);
  assert.equal(second.length, NEAR_WORK_TOKEN_BUDGET);
  assert.notEqual(first[0].id, second[0].id);
  const ids = [...first, ...second].map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('fodder mass list prefers collidables over the fat list', () => {
  const rock = {
    id: 4, type: 'asteroid', alive: true, collides: true, pos: { x: 10, z: 10 }, radius: 8,
  };
  const ghost = {
    id: 5, type: 'fx', alive: true, collides: false, pos: { x: 10, z: 10 }, radius: 8,
  };
  const director = createFodderCohortDirector({ seed: 7 });
  director.stepAll(1, 1 / 60, [{ id: 'c1' }], null, {
    entityList: [ghost, rock],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      collidables: [rock],
    },
  });
  assert.equal(director.massScratch.length, 1);
  assert.equal(director.massScratch[0].id, 4);
});

test('default quality preset is balanced and keeps the default picture', () => {
  assert.equal(DEFAULT_QUALITY_PRESET, 'medium');
  const labels = QUALITY_PRESETS.map((p) => p.label);
  assert.ok(labels.includes('Balanced (recommended)'));
  assert.ok(labels.includes('Performance'));
  assert.ok(labels.includes('Quality'));
  const tier = qualityTierForPreset('medium');
  assert.equal(tier.renderScale, 1);
  assert.equal(tier.bloom, true);
  assert.equal(tier.shadows, true);
  assert.equal(tier.engineTrails, true);
  assert.equal(tier.particleQuality, 'medium');
  assert.equal(tier.renderGraph, false);
});

test('event bus reuses the listener snapshot until on/off', () => {
  const bus = createBus();
  const hits = [];
  const a = () => hits.push('a');
  const b = () => hits.push('b');
  bus.on('ping', a);
  bus.on('ping', b);
  bus.emit('ping');
  bus.emit('ping');
  assert.deepEqual(hits, ['a', 'b', 'a', 'b']);
  bus.off('ping', b);
  bus.emit('ping');
  assert.deepEqual(hits, ['a', 'b', 'a', 'b', 'a']);
});

test('combat table entity query still hits packed ships', () => {
  const ship = {
    id: 3, type: 'ship', alive: true, pos: { x: 4, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, team: 1,
  };
  const state = {
    tick: 4,
    playerId: 1,
    entities: new Map([[3, ship]]),
    entityIndex: { shipLike: [ship], projectiles: [], wrecks: [] },
  };
  packCombatTable(state);
  const hits = queryCombatTableEntities(state, 0, 0, 10, [], COMBAT_TABLE_FLAGS.SHIP);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 3);
});

test('retained-slot GPU batch stays off on the live renderer', () => {
  const renderer = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/render/renderer.js'),
    'utf8',
  );
  assert.match(renderer, /this\._opaqueBatchEnabled = false/);
});
