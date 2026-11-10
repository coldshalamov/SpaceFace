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
  // Body ends at the next top-level declaration, not a fixed window — the function grew and
  // a character budget silently read past its closing brace.
  let end = rendererSrc.length;
  for (const marker of ['\nfunction ', '\nexport function ', '\nexport async function ', '\nasync function ']) {
    const next = rendererSrc.indexOf(marker, start + 40);
    if (next !== -1 && next < end) end = next;
  }
  const body = rendererSrc.slice(start, end);
  // The roster collection lives in collectEncounterWarmChannels — slice its body the same way.
  const helperStart = rendererSrc.indexOf('function collectEncounterWarmChannels');
  assert.notEqual(helperStart, -1, 'collectEncounterWarmChannels must exist');
  let helperEnd = rendererSrc.length;
  for (const marker of ['\nfunction ', '\nexport function ', '\nexport async function ', '\nasync function ']) {
    const next = rendererSrc.indexOf(marker, helperStart + 40);
    if (next !== -1 && next < helperEnd) helperEnd = next;
  }
  const helperBody = rendererSrc.slice(helperStart, helperEnd);
  assert.match(body, /state\.encounterDirector\s*&&\s*state\.encounterDirector\.pending/,
    'the poll reads the director pending list');
  assert.match(body, /item\.dueAt\s*-\s*now\s*>\s*TABLE_DECODE_RUNWAY_SECONDS/,
    'items warm only once inside the decode-runway lead window');
  assert.match(body, /collectEncounterWarmChannels\(item, archetypes, files\)/,
    'the poll delegates roster collection to the warm-channels helper');
  assert.match(helperBody, /ship\.archetype/,
    'the roster comes from item.ships[].archetype');
  assert.match(helperBody, /ship\.entitySpec/,
    'entitySpec escape-hatch records are collected alongside archetype rows');
  assert.match(body, /'encounter-pending-decode-runway'/,
    'the warm posts a deadline-class runway role, not the visible class');
  assert.doesNotMatch(body, /warmedAt|WarmDueAt|WeakMap/,
    'no once-fired latch: every in-window poll re-posts so an eviction re-decodes');
});

test('the pending-squad warm runs on the residency poll beside sector prewarm', () => {
  // "Beside" means in the same warm block — the frame-pacing ladder interleaves `yield;`
  // statements between the calls, so a two-statement window (not adjacent lines) is the contract.
  assert.match(rendererSrc,
    /updatePredictedSectorPrewarmSteps\s*&&\s*\(yield\*\s*updatePredictedSectorPrewarmSteps\(this\)\);\s*\r?\n\s*yield;\s*\r?\n\s*warmEncounterPendingDecode\(this\);/,
    'warmEncounterPendingDecode must be wired beside updatePredictedSectorPrewarmSteps');
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

// D231 / F-LOAD-04: the claim-defense roster map is per-run bookkeeping on a renderer that
// outlives the run. run:ended fires only for non-adventure runs (runSession._onExitToMenu), so
// the campaign's title → New Game / Continue cycle must clear it on game:new and save:restoring
// too — otherwise every defense live at exit leaves a permanent entry.
test('claim-defense warm rosters clear on every run boundary', () => {
  const handlerBody = (event) => {
    const marker = `onBus('${event}', `;
    const start = rendererSrc.indexOf(marker);
    assert.notEqual(start, -1, `renderer must subscribe ${event}`);
    const next = rendererSrc.indexOf('\n    onBus(', start + marker.length);
    return rendererSrc.slice(start, next === -1 ? start + 4000 : next);
  };
  for (const event of ['run:ended', 'game:new', 'save:restoring']) {
    assert.match(handlerBody(event), /this\._claimDefenseRosters\)\s*this\._claimDefenseRosters\.clear\(\)/,
      `${event} must clear _claimDefenseRosters`);
  }
});
