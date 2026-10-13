import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { GALLERY_ASSETS, assetForKind } from '../assets.js';
import { PLAYABLE_SLICE, SCENARIOS, getScenario } from '../catalog.js';
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

test('only an exhibit may select a tape, and an empty tape stays live', () => {
  const strategy = { tape: [{ until: 5, moveZ: 1 }] };
  assert.deepEqual(sessionInput({}, strategy), { source: 'live', tape: null });
  assert.deepEqual(sessionInput({ tape: strategy.tape }, strategy), { source: 'live', tape: null });
  assert.deepEqual(sessionInput({ tape: [] }, strategy), { source: 'live', tape: null });
  assert.deepEqual(sessionInput({ exhibit: true, tape: [] }, strategy), { source: 'live', tape: null });
  assert.equal(sessionInput({ exhibit: true }, strategy).source, 'exhibit');
  assert.equal(sessionInput({ exhibit: true }, strategy).tape, strategy.tape);
  assert.equal(sessionInput({ exhibit: true, tape: strategy.tape }, strategy).source, 'exhibit');
});

function reopen(gallery) {
  gallery.result = null;
  gallery.phase = 'live';
}

test('an empty planted field list cannot win the eye', () => {
  const pod = {
    id: 2, alive: true, pos: { x: 72, z: 0 }, vel: { x: 0, z: 0 },
    data: { galleryRole: 'pod', gallerySpawnX: 28, gallerySpawnZ: 0, galleryAsset: assetForKind('mass') },
  };
  const player = { id: 1, alive: true, hull: 100, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
  const field = getScenario('og-e1-into-the-well').fields[0];
  const state = {
    tick: 20, playerId: 1, entities: new Map([[1, player], [2, pod]]),
    orbitalGallery: {
      scenarioId: 'og-e1-into-the-well', phase: 'live', playStartTick: 0, limitTicks: 360,
      roles: { pod: 2 }, pockets: [{ id: 'eye', role: 'pod', x: 72, z: 0, r: 16, minTravel: 18 }],
      hazards: [], spoils: [], spoiled: {}, plantedFields: [], fieldPlanted: true, fieldUsed: true,
      tetherLatched: false,
    },
  };
  assert.equal(judgeGallery(state), null);
  state.orbitalGallery.plantedFields = [{ id: field.id, x: 0, z: 400, radius: field.radius }];
  state.orbitalGallery.fieldUsed = false;
  assert.equal(judgeGallery(state), null);
  state.orbitalGallery.plantedFields = [{ id: field.id, x: field.x, z: field.z, radius: field.radius }];
  const won = judgeGallery(state);
  assert.equal(won && won.won, true);
  assert.equal(won.pocketId, 'eye');
});

test('a missing line or a cut cannot win north-berth', () => {
  const player = { id: 1, alive: true, hull: 100, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
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
  const line = {
    id: 'att_000001', state: 'active', defId: 'tether_standard', ownerId: 1, targetId: 4,
  };
  const state = {
    tick: 20, playerId: 1, entities: new Map([[1, player], [4, anchor], [5, north], [6, south]]),
    combat: { attachments: { byId: { att_000001: line } } },
    orbitalGallery: {
      scenarioId: 'og-b1-orbit-strike', phase: 'live', playStartTick: 0, limitTicks: 360,
      roles: { pilot: 1, anchor: 4, north: 5, south: 6 },
      pockets: [{ id: 'north-berth', role: 'north', x: -24, z: 78, r: 14, minTravel: 12 }],
      hazards: [], spoils: [], spoiled: {}, plantedFields: [], fieldUsed: false,
      tetherLatched: true, cuts: 0,
    },
  };
  delete state.combat;
  assert.equal(judgeGallery(state), null);
  state.combat = { attachments: { byId: { att_000001: line } } };
  const won = judgeGallery(state);
  assert.equal(won && won.won, true);
  assert.equal(won.pocketId, 'north-berth');
  reopen(state.orbitalGallery);
  line.state = 'broken';
  line.breakReason = 'pilot';
  assert.equal(judgeGallery(state), null);
  reopen(state.orbitalGallery);
  line.state = 'active';
  state.orbitalGallery.cuts = 1;
  assert.equal(judgeGallery(state), null);
});

test('a deleted motor cannot win intercept or the gap', () => {
  const player = { id: 1, alive: true, hull: 100, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
  const motor = getScenario('og-d1-intercept').bodies.find((body) => body.role === 'pod').motor;
  const pod = {
    id: 2, alive: true, pos: { x: 72, z: -12 }, vel: { x: 0, z: 0 },
    data: {
      galleryRole: 'pod', gallerySpawnX: 32, gallerySpawnZ: -32,
      galleryAsset: assetForKind('survivor'), galleryMotorWorked: true,
    },
  };
  const motorState = {
    tick: 20, playerId: 1, entities: new Map([[1, player], [2, pod]]),
    orbitalGallery: {
      scenarioId: 'og-d1-intercept', phase: 'live', playStartTick: 0, limitTicks: 360,
      roles: { pod: 2 }, pockets: [{ id: 'early', role: 'pod', x: 72, z: -12, r: 16, minTravel: 12 }],
      hazards: [], spoils: [], spoiled: {}, plantedFields: [], fieldUsed: false,
      tetherLatched: false, motorUsed: true,
    },
  };
  assert.equal(judgeGallery(motorState), null);
  pod.data.galleryMotor = { ...motor };
  pod.data.galleryMotorWorked = false;
  assert.equal(judgeGallery(motorState), null);
  pod.data.galleryMotorWorked = true;
  const early = judgeGallery(motorState);
  assert.equal(early && early.won, true);
  assert.equal(early.pocketId, 'early');

  const gapMotor = getScenario('og-d2-gap').bodies.find((body) => body.role === 'blocker').motor;
  const cargo = {
    id: 2, alive: true, pos: { x: 88, z: 0 }, vel: { x: 0, z: 0 },
    data: { galleryRole: 'pod', gallerySpawnX: 24, gallerySpawnZ: 0, galleryAsset: assetForKind('survivor') },
  };
  const blocker = {
    id: 3, alive: true, pos: { x: 52, z: -20 }, vel: { x: 0, z: 0 },
    data: {
      galleryRole: 'blocker', galleryAsset: assetForKind('traffic'),
      galleryMotor: { ...gapMotor }, galleryMotorWorked: true,
    },
  };
  const gapState = {
    tick: 20, playerId: 1, entities: new Map([[1, player], [2, cargo], [3, blocker]]),
    orbitalGallery: {
      scenarioId: 'og-d2-gap', phase: 'live', playStartTick: 0, limitTicks: 360,
      roles: { pod: 2, blocker: 3 },
      pockets: [{ id: 'through', role: 'pod', x: 88, z: 0, r: 14, minTravel: 20 }],
      hazards: [], spoils: [], spoiled: {}, plantedFields: [], fieldUsed: false, tetherLatched: false,
    },
  };
  const through = judgeGallery(gapState);
  assert.equal(through && through.won, true);
  assert.equal(through.pocketId, 'through');
  reopen(gapState.orbitalGallery);
  delete blocker.data.galleryMotor;
  assert.equal(judgeGallery(gapState), null);
});

test('a hard hit turns the prop into the fracture product the win checks', () => {
  const rock = { id: 3, hull: 8000, data: { galleryRole: 'wall', galleryAsset: assetForKind('bumper') } };
  noteImpact({
    entities: new Map([[3, rock]]),
    playerId: 1,
    orbitalGallery: { phase: 'live', source: 'live', roles: { wall: 3 }, spoils: [] },
  }, { aId: 1, bId: 3, preSolveClosingSpeed: 55 });
  assert.equal(rock.data.galleryFractured, true);
  assert.equal(rock.hull, 0);
  assert.equal(rock.data.fractureInto, 'mass');
  assert.equal(rock.data.galleryAsset, assetForKind('mass'));

  const player = { id: 1, alive: true, hull: 100, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
  const anchor = {
    id: 4, alive: true, hull: 0, pos: { x: -52, z: 0 }, vel: { x: 0, z: 0 },
    data: {
      galleryRole: 'anchor', galleryAsset: assetForKind('anchor'),
      galleryFractured: true, fractureInto: 'mass',
    },
  };
  const north = {
    id: 5, alive: true, pos: { x: -24, z: 78 }, vel: { x: 0, z: 0 },
    data: { galleryRole: 'north', gallerySpawnX: -8, gallerySpawnZ: 34, galleryAsset: assetForKind('mass') },
  };
  const state = {
    tick: 20, playerId: 1, entities: new Map([[1, player], [4, anchor], [5, north]]),
    combat: { attachments: { byId: {
      att_000001: { state: 'active', defId: 'tether_standard', ownerId: 1, targetId: 4 },
    } } },
    orbitalGallery: {
      scenarioId: 'og-b1-orbit-strike', phase: 'live', playStartTick: 0, limitTicks: 360,
      roles: { pilot: 1, anchor: 4, north: 5 },
      pockets: [{ id: 'north-berth', role: 'north', x: -24, z: 78, r: 14, minTravel: 12 }],
      hazards: [], spoils: [], spoiled: {}, plantedFields: [], cuts: 0,
    },
  };
  assert.equal(anchor.data.galleryAsset.id, 'helios-rock-b');
  assert.equal(judgeGallery(state), null);
  anchor.data.galleryAsset = assetForKind('mass');
  const won = judgeGallery(state);
  assert.equal(won && won.won, true);
  assert.equal(won.pocketId, 'north-berth');

  const heavy = {
    id: 7, alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    data: { galleryRole: 'heavy', gallerySpawnX: 68, gallerySpawnZ: 0, galleryAsset: assetForKind('mass') },
  };
  const northGate = {
    id: 8, alive: true, pos: { x: 48, z: 16 }, vel: { x: 0, z: 0 },
    data: { galleryRole: 'north', galleryAsset: { id: 'helios-rock-a' } },
  };
  const southGate = {
    id: 9, alive: true, pos: { x: 48, z: -16 }, vel: { x: 0, z: 0 },
    data: { galleryRole: 'south', galleryAsset: assetForKind('bumper') },
  };
  const gate = {
    tick: 20, playerId: 1, entities: new Map([[1, player], [7, heavy], [8, northGate], [9, southGate]]),
    orbitalGallery: {
      scenarioId: 'og-a3-gate-cue', phase: 'live', playStartTick: 0, limitTicks: 300,
      roles: { heavy: 7, north: 8, south: 9 },
      pockets: [{ id: 'berth', role: 'heavy', x: 100, z: 0, r: 14, minTravel: 10 }],
      hazards: [], spoils: [], spoiled: {}, plantedFields: [],
    },
  };
  assert.equal(judgeGallery(gate), null);
  northGate.data.galleryAsset = assetForKind('anchor');
  assert.equal(judgeGallery(gate), null);
  gate.entities.delete(8);
  assert.equal(judgeGallery(gate), null);
  gate.entities.set(8, northGate);
  northGate.data.galleryAsset = assetForKind('bumper');
  const berthed = judgeGallery(gate);
  assert.equal(berthed && berthed.won, true);
  assert.equal(berthed.pocketId, 'berth');
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
