import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { flightReadyInPage } from '../scripts/lib/alphaLiveBaselineRoute.mjs';

test('public performance route accepts invisible pending ships but rejects real fallbacks', () => {
  const player = ship(1, 'authored', 'ready');
  const pending = ship(2, 'awaiting-authored-admission', 'pending');
  const state = {
    mode: 'flight',
    playerId: player.id,
    entities: new Map([[player.id, player], [pending.id, pending]]),
    entityList: [player, pending],
  };
  const restore = installBrowserGlobals(state);
  try {
    assert.equal(flightReadyInPage(), true,
      'quality-preserving zero-draw pending admission cannot hold the playable opening route');

    pending.presentationAdmission = 'unavailable';
    pending.mesh.userData.authoredAssetState = 'fallback-after-error';
    assert.equal(flightReadyInPage(), false, 'a failed authored admission still fails closed');

    pending.presentationAdmission = 'pending';
    pending.mesh.userData.authoredAssetState = 'awaiting-authored-admission';
    player.presentationAdmission = 'pending';
    player.mesh.userData.authoredAssetState = 'compiling-pipelines';
    assert.equal(flightReadyInPage(), false, 'the player must be authored before control is exposed');
  } finally {
    restore();
  }
});

test('public flight proof waits for key release on a later fixed tick', async () => {
  const source = await readFile(new URL('../scripts/lib/alphaLiveBaselineRoute.mjs', import.meta.url), 'utf8');
  assert.match(source, /page\.waitForFunction\(\(heldTick\)\s*=>[\s\S]*state\?\.tick[\s\S]*state\?\.input\?\.moveZ[\s\S]*state\?\.input\?\.boost/);
  assert.match(source, /Number\(boostHeld\?\.tick \|\| 0\)/);
});

test('performance recovery completes the active Departure Check and retains structural Undock fallbacks', async () => {
  const source = await readFile(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8');
  assert.match(source, /locator\(['"]button\[data-pop-launch\]['"]\)/);
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name:\s*\/\\blaunch\\b\/i\s*\}\)/);
  assert.match(source, /departureLaunch\.click\(\)/);
  assert.match(source, /locator\(['"]button\[data-act=[\\'"]undock[\\'"]\]['"]\)/);
  assert.match(source, /locator\(['"]button\.st-undock['"]\)/);
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name:\s*\/\\bundock\\b\/i\s*\}\)/);
  assert.match(source, /skipStationHubAcceptance:\s*true/,
    'the performance route owns active Market-shell acceptance instead of the legacy stationHub DOM contract');
  assert.match(source, /PerformanceObserver\.supportedEntryTypes\?\.includes\(['"]gc['"]\)/,
    'optional GC observation must not emit a browser warning when unsupported');
  assert.match(source, /\.sx-trade__go\[data-go\], \.st-buy-btn/,
    'Market readiness accepts the active shell while retaining compatibility coverage');
  assert.match(source, /const activeTradeShell = page\.locator\(['"]\.sx-trade:visible['"]\)/,
    'active Market actions are scoped to the visible trade console');
  assert.match(source, /\[data-cmdty\]\[role=\\?['"]tab\\?['"]\]\[aria-selected=\\?['"]true\\?['"]\]/,
    'the active Market roundtrip binds its selected public commodity tab');
  assert.doesNotMatch(source, /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]Undock['"],\s*exact:\s*true/);
});

function ship(id, authoredAssetState, presentationAdmission) {
  return {
    id,
    type: 'ship',
    alive: true,
    hull: 100,
    presentationAdmission,
    mesh: { userData: { authoredAssetState } },
  };
}

function installBrowserGlobals(state) {
  const prior = new Map();
  const globals = {
    window: { SF: { state } },
    document: {
      body: { classList: { contains: () => false } },
      getElementById: () => null,
      querySelector: () => null,
    },
    getComputedStyle: () => ({ display: 'none', visibility: 'hidden' }),
  };
  for (const [key, value] of Object.entries(globals)) {
    prior.set(key, Object.prototype.hasOwnProperty.call(globalThis, key)
      ? { owned: true, value: globalThis[key] }
      : { owned: false });
    globalThis[key] = value;
  }
  return () => {
    for (const [key, previous] of prior) {
      if (previous.owned) globalThis[key] = previous.value;
      else delete globalThis[key];
    }
  };
}
