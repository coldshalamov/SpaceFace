import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { GALLERY_ASSETS, assetForKind } from '../assets.js';
import { PLAYABLE_SLICE, SCENARIOS } from '../catalog.js';
import { judgeGallery, noteImpact } from '../judge.js';
import { runGalleryProof } from '../proof.js';
import { sessionInput } from '../session.js';
import { validateCatalog } from '../validate.js';

const ROOT = join(import.meta.dirname, '../../../..');

test('orbital gallery catalog is 24 launchable challenges on the shipping glass', () => {
  const issues = validateCatalog(SCENARIOS);
  assert.deepEqual(issues, [], issues.join('\n'));
  assert.equal(SCENARIOS.length, 24);
  assert.equal(PLAYABLE_SLICE.length, 6);
  assert.deepEqual(PLAYABLE_SLICE, SCENARIOS.slice(0, 6).map((scenario) => scenario.id));
  const duals = SCENARIOS.filter((scenario) => scenario.strategies.length >= 2);
  assert.equal(duals.length, 12);
  const families = new Set(SCENARIOS.map((scenario) => scenario.family));
  assert.equal(families.size, 6);
  for (const asset of Object.values(GALLERY_ASSETS)) {
    for (const relative of asset.lod) {
      assert.equal(existsSync(join(ROOT, relative)), true, relative);
    }
  }
});

test('orbital gallery sources do not roll Math.random', () => {
  const dir = join(import.meta.dirname, '..');
  const files = readdirSync(dir).filter((name) => name.endsWith('.js'));
  for (const name of files) {
    const text = readFileSync(join(dir, name), 'utf8');
    assert.equal(text.includes('Math.random'), false, name);
  }
});

test('a live session does not auto-play an exhibit tape', () => {
  const strategy = { tape: [{ until: 5, moveZ: 1 }] };
  assert.deepEqual(sessionInput({}, strategy), { source: 'live', tape: null });
  assert.equal(sessionInput({ exhibit: true }, strategy).source, 'exhibit');
  assert.equal(sessionInput({ exhibit: true }, strategy).tape, strategy.tape);
});

test('pocket wins require the authored field, tether, motor, and named prop', () => {
  const cue = {
    id: 2, alive: true, pos: { x: 88, z: 0 }, vel: { x: 0, z: 0 },
    data: { galleryRole: 'pod', gallerySpawnX: 28, gallerySpawnZ: 0, galleryAsset: assetForKind('mass') },
  };
  const player = { id: 1, alive: true, hull: 100, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
  const fieldState = {
    tick: 20, playerId: 1, entities: new Map([[1, player], [2, cue]]),
    orbitalGallery: {
      scenarioId: 'og-e1-into-the-well', phase: 'live', playStartTick: 0, limitTicks: 300,
      roles: { pod: 2 }, pockets: [{ id: 'eye', role: 'pod', x: 88, z: 0, r: 16, minTravel: 12 }],
      hazards: [], spoils: [], spoiled: {}, plantedFields: [], fieldUsed: false, tetherLatched: false,
    },
  };
  assert.equal(judgeGallery(fieldState), null);
  fieldState.orbitalGallery.fieldPlanted = true;
  assert.equal(judgeGallery(fieldState).won, true);

  const pod = {
    id: 2, alive: true, pos: { x: 72, z: -12 }, vel: { x: 0, z: 0 },
    data: { galleryRole: 'pod', gallerySpawnX: 32, gallerySpawnZ: -32, galleryAsset: assetForKind('survivor') },
  };
  const motorState = {
    tick: 20, playerId: 1, entities: new Map([[1, player], [2, pod]]),
    orbitalGallery: {
      scenarioId: 'og-d1-intercept', phase: 'live', playStartTick: 0, limitTicks: 360,
      roles: { pod: 2 }, pockets: [{ id: 'early', role: 'pod', x: 72, z: -12, r: 16, minTravel: 12 }],
      hazards: [], spoils: [], spoiled: {}, plantedFields: [], fieldUsed: false, tetherLatched: false,
    },
  };
  assert.equal(judgeGallery(motorState), null);
  pod.data.galleryMotorWorked = true;
  assert.equal(judgeGallery(motorState).won, true);

  const anchor = {
    id: 4, alive: true, pos: { x: -52, z: 0 }, vel: { x: 0, z: 0 }, hull: 8000,
    data: { galleryRole: 'anchor', galleryAsset: assetForKind('anchor') },
  };
  const north = {
    id: 5, alive: true, pos: { x: -24, z: 78 }, vel: { x: 0, z: 0 },
    data: { galleryRole: 'north', gallerySpawnX: -8, gallerySpawnZ: 34, galleryAsset: assetForKind('mass') },
  };
  const south = {
    id: 6, alive: true, pos: { x: -8, z: -34 }, vel: { x: 0, z: 0 },
    data: { galleryRole: 'south', galleryAsset: assetForKind('mass') },
  };
  const tetherState = {
    tick: 20, playerId: 1, entities: new Map([[1, player], [4, anchor], [5, north], [6, south]]),
    orbitalGallery: {
      scenarioId: 'og-b1-orbit-strike', phase: 'live', playStartTick: 0, limitTicks: 360,
      roles: { anchor: 4, north: 5, south: 6 },
      pockets: [{ id: 'north-berth', role: 'north', x: -24, z: 78, r: 14, minTravel: 12 }],
      hazards: [], spoils: [], spoiled: {}, plantedFields: [], fieldUsed: false, tetherLatched: false,
    },
  };
  assert.equal(judgeGallery(tetherState), null);
  tetherState.orbitalGallery.tetherLatched = true;
  assert.equal(judgeGallery(tetherState).won, true);

  const rock = { id: 3, hull: 8000, data: { galleryRole: 'wall', galleryAsset: assetForKind('bumper') } };
  noteImpact({
    entities: new Map([[3, rock]]),
    playerId: 1,
    orbitalGallery: { phase: 'live', source: 'live', roles: { wall: 3 }, spoils: [] },
  }, { aId: 1, bId: 3, preSolveClosingSpeed: 55 });
  assert.equal(rock.data.galleryFractured, true);
  assert.equal(rock.hull, 0);
  assert.equal(rock.data.fractureInto, 'mass');
});

test('orbital gallery proof: 24 fixed-seed wins, distinct duals, idle fails, retry, live stick', { timeout: 180000 }, async () => {
  const report = await runGalleryProof();
  assert.equal(report.ok, true, report.summary);
  assert.equal(report.physicsProof.backend, 'rapier-dynamic');
  assert.equal(report.physicsProof.sg02Ready, true);
  assert.equal(report.physicsProof.physicsBackend, 'rapier-dynamic');
  assert.equal(report.physicsProof.flightBackend, 'v3');
  assert.equal(report.determinism, true);
  assert.equal(report.retry.ok, true);
  assert.equal(report.live.ok, true);
  assert.equal(report.idleIssues.length, 0);
  assert.equal(report.dualIssues.length, 0);
  for (const id of PLAYABLE_SLICE) {
    assert.ok(report.wins.some((win) => win.id === id), id);
  }
});
