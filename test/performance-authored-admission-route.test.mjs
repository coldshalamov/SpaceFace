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

test('performance recovery binds the canonical Undock action without pinning presentation copy', async () => {
  const source = await readFile(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8');
  assert.match(source, /locator\(['"]button\.st-undock['"]\)/);
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name:\s*\/\\bundock\\b\/i\s*\}\)/);
  assert.match(source, /canonicalConfirm\.and\(computedUndockRole\)/);
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
