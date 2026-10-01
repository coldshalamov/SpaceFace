import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Source-contract tests for the wave-11 popin-admission batch: paced encounter rosters
// carry their archetypes at plan time but telegraph->spawn resolves inside one tick, so a
// lead-window poll warms them ahead of the spawn kick; non-wave runway polls carry a warm
// residency role so their decode survives byte pressure; and the place/payload commit paths
// refuse a stale run the same way the ship commit already did.
const rendererSrc = fs.readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const partsLibrarySrc = fs.readFileSync(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');

test('encounter pending squads warm through the roster decode lane inside the decode runway', () => {
  const start = rendererSrc.indexOf('function warmEncounterPendingDecode');
  assert.notEqual(start, -1, 'warmEncounterPendingDecode must exist');
  const body = rendererSrc.slice(start, start + 3000);
  assert.match(body, /state\.encounterDirector\s*&&\s*state\.encounterDirector\.pending/,
    'the poll reads the director pending list');
  assert.match(body, /item\.dueAt\s*-\s*now\s*>\s*TABLE_DECODE_RUNWAY_SECONDS/,
    'items warm only once inside the decode-runway lead window');
  assert.match(body, /ship\s*&&\s*ship\.archetype/,
    'the roster comes from item.ships[].archetype');
  assert.match(body, /'encounter-pending-decode-runway'/,
    'the warm posts a deadline-class runway role, not the visible class');
  assert.match(body, /WeakMap\(\)/,
    'warmed dueAt is tracked per pending item so deferred items re-warm');
});

test('the pending-squad warm runs on the residency poll beside sector prewarm', () => {
  assert.match(rendererSrc,
    /updatePredictedSectorPrewarm\(this\);\s*\r?\n\s*warmEncounterPendingDecode\(this\);/,
    'warmEncounterPendingDecode must be wired beside updatePredictedSectorPrewarm');
});

test('non-wave ship runway polls carry a warm residency role so the decode survives byte pressure', () => {
  assert.match(rendererSrc,
    /\{\s*residencyRole:\s*'decode-runway-prepare'\s*\}/,
    'non-wave runway decodes must post the warm-purpose residency role');
});

test('place and cargo commit paths refuse stale admission runs like the ship commit', () => {
  const cargoCommit = partsLibrarySrc.indexOf('return commitAuthoredCargoCapsuleBoundary(');
  assert.notEqual(cargoCommit, -1);
  const cargoGuard = partsLibrarySrc.slice(cargoCommit - 1200, cargoCommit);
  assert.match(cargoGuard, /boundary\.userData\.admissionEpoch\s*!==\s*options\.admissionEpoch/,
    'cargo commit must drop a run whose epoch the boundary superseded');
  assert.match(cargoGuard, /options\.isAbortedStalledAdmission\?\.\(\)|typeof options\.isAbortedStalledAdmission === 'function' && options\.isAbortedStalledAdmission\(\)/,
    'cargo commit must drop stall-aborted runs');
  assert.match(cargoGuard, /installedPreparedDisposer\s*\?\s*installedPreparedDisposer\(\)\s*:\s*disposePreparedCargoCapsule\(\)\s*\)\s*\|\|\s*disposeOwnedPreparedBoundary\(boundary/,
    'cargo commit must dispose only its own prepared tree');

  const placeCommit = partsLibrarySrc.indexOf('return commitAuthoredPlaceBoundary(');
  assert.notEqual(placeCommit, -1);
  const placeGuard = partsLibrarySrc.slice(placeCommit - 1400, placeCommit);
  assert.match(placeGuard, /boundary\.userData\.admissionEpoch\s*!==\s*options\.admissionEpoch/,
    'place commit must drop a run whose epoch the boundary superseded');
  assert.match(placeGuard, /installedPreparedDisposer\s*\?\s*installedPreparedDisposer\(\)\s*:\s*disposePreparedPlace\(\)\s*\)\s*\|\|\s*disposeOwnedPreparedBoundary\(boundary/,
    'place commit must dispose only its own prepared tree');
});
